import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { DirectoryEntry } from '../../system/loadDirectoryEntries.js';
import type { ExploreToolCommandRun } from '../exploreProbe.js';
import type { ExploreFileUnreadable, ExploreProbeFailure } from '../exploreUnit.js';
import { loadExploreDirectoryEntries } from '../loadExploreRead.js';
import { loadProbeOutput } from '../loadProbeOutput.js';
import type { HomebrewOldVersions } from './buildHomebrewOldVersions.js';
import { buildHomebrewOldVersions } from './buildHomebrewOldVersions.js';
import type { HomebrewOrphan } from './decideHomebrewOrphans.js';
import { parseHomebrewAutoremoveDryRun } from './parseHomebrewAutoremoveDryRun.js';
import { parseHomebrewCellarPath } from './parseHomebrewCellarPath.js';
import { parseHomebrewCleanupDryRun } from './parseHomebrewCleanupDryRun.js';
import type { HomebrewFormulaName } from './parseHomebrewFormulaName.js';

/**
 * What `brew --cellar`, `brew cleanup -n`, and `brew autoremove -n` of one brew answered, with the
 * racks of the orphans read.
 */
export type HomebrewState = {
  cellarPath: AbsolutePath;
  oldVersions: HomebrewOldVersions[];
  orphans: HomebrewOrphan[];
};

/**
 * Runs the three read-only commands of the located brew once, each with the time left before the
 * run's deadline, for its probe and the rechecks of its units, then reads the rack of each orphan.
 * The first failed command or failed rack read ends it.
 */
export async function loadHomebrewState(
  run: ExploreToolCommandRun,
): Promise<Result<HomebrewState, ExploreProbeFailure>> {
  const cellarPath = await loadProbeOutput({
    ...run,
    probe: { toolName: run.tool.name, args: ['--cellar'], parse: parseHomebrewCellarPath },
  });

  if (cellarPath.kind === 'failed') {
    return cellarPath;
  }

  const removals = await loadProbeOutput({
    ...run,
    probe: { toolName: run.tool.name, args: ['cleanup', '-n'], parse: parseHomebrewCleanupDryRun },
  });

  if (removals.kind === 'failed') {
    return removals;
  }

  const orphanFormulae = await loadProbeOutput({
    ...run,
    probe: {
      toolName: run.tool.name,
      args: ['autoremove', '-n'],
      parse: parseHomebrewAutoremoveDryRun,
    },
  });

  if (orphanFormulae.kind === 'failed') {
    return orphanFormulae;
  }

  const oldVersions = buildHomebrewOldVersions({
    cellarPath: cellarPath.value,
    removals: removals.value,
  });

  if (oldVersions.kind === 'failed') {
    return { kind: 'failed', failure: { reason: 'outputUnreadable', detail: oldVersions.failure } };
  }

  const orphans = await loadHomebrewOrphans({
    cellarPath: cellarPath.value,
    formulae: orphanFormulae.value,
  });

  if (orphans.kind === 'failed') {
    return orphans;
  }

  return {
    kind: 'succeeded',
    value: { cellarPath: cellarPath.value, oldVersions: oldVersions.value, orphans: orphans.value },
  };
}

/** The rack of each formula as an orphan, in the order of `params.formulae`; a failed read fails. */
async function loadHomebrewOrphans(params: {
  cellarPath: AbsolutePath;
  formulae: HomebrewFormulaName[];
}): Promise<Result<HomebrewOrphan[], ExploreFileUnreadable>> {
  const orphanReads = await Promise.all(
    params.formulae.map((formula) =>
      loadHomebrewOrphan({ cellarPath: params.cellarPath, formula: formula }),
    ),
  );

  return gatherHomebrewOrphanReads({ orphanReads: orphanReads });
}

async function loadHomebrewOrphan(params: {
  cellarPath: AbsolutePath;
  formula: HomebrewFormulaName;
}): Promise<Result<HomebrewOrphan, ExploreFileUnreadable>> {
  const rackPath = joinAbsolutePath({ parentPath: params.cellarPath, names: [params.formula] });
  const rack = await loadExploreDirectoryEntries({ path: rackPath });

  if (rack.kind === 'failed') {
    return rack;
  }

  return {
    kind: 'succeeded',
    value: {
      formula: params.formula,
      rackPath: rackPath,
      kegCount: countKegFolders({ entries: rack.value }),
    },
  };
}

/** The orphans of the reads in their order, or the first failed read. */
function gatherHomebrewOrphanReads(params: {
  orphanReads: Result<HomebrewOrphan, ExploreFileUnreadable>[];
}): Result<HomebrewOrphan[], ExploreFileUnreadable> {
  const orphans: HomebrewOrphan[] = [];

  for (const orphanRead of params.orphanReads) {
    if (orphanRead.kind === 'failed') {
      return orphanRead;
    }

    orphans.push(orphanRead.value);
  }

  return { kind: 'succeeded', value: orphans };
}

/** The keg folders of a rack as Homebrew's `rack.subdirs` counts them; `null` for no rack. */
function countKegFolders(params: { entries: DirectoryEntry[] | null }): number | null {
  if (params.entries === null) {
    return null;
  }

  return params.entries.filter((entry) => entry.kind === 'directory').length;
}
