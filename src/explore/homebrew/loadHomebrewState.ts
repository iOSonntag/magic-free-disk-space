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
import { parseHomebrewAutoremoveDryRun } from './parseHomebrewAutoremoveDryRun.js';
import { parseHomebrewCellarPath } from './parseHomebrewCellarPath.js';
import { parseHomebrewCleanupDryRun } from './parseHomebrewCleanupDryRun.js';
import type { HomebrewFormulaName } from './parseHomebrewFormulaName.js';

/** A formula `brew autoremove -n` lists, with its rack `<cellar>/<formula>`. */
export type HomebrewOrphan = { formula: HomebrewFormulaName; kegPath: AbsolutePath };

/** The orphans when each rack holds the one keg `brew autoremove` removes, none listed included. */
export type HomebrewOrphansJudged = { kind: 'judged'; orphans: HomebrewOrphan[] };

/** A rack of an orphan that is gone, no folder, or holds no keg or more than one. */
export type HomebrewOrphansNotJudged = { kind: 'notJudged' };

export type HomebrewOrphans = HomebrewOrphansJudged | HomebrewOrphansNotJudged;

/**
 * What `brew --cellar`, `brew cleanup -n`, and `brew autoremove -n` of one brew answered, with the
 * racks of the orphans read.
 */
export type HomebrewState = {
  cellarPath: AbsolutePath;
  oldVersions: HomebrewOldVersions[];
  orphans: HomebrewOrphans;
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

/**
 * Judged only while each rack holds exactly one keg folder, as Homebrew's `rack.subdirs` counts,
 * since `brew autoremove` uninstalls one keg of each orphan and its unit measures the whole rack.
 */
async function loadHomebrewOrphans(params: {
  cellarPath: AbsolutePath;
  formulae: HomebrewFormulaName[];
}): Promise<Result<HomebrewOrphans, ExploreFileUnreadable>> {
  const orphans = params.formulae.map((formula) => ({
    formula: formula,
    kegPath: joinAbsolutePath({ parentPath: params.cellarPath, names: [formula] }),
  }));
  const racks = await Promise.all(
    orphans.map((orphan) => loadExploreDirectoryEntries({ path: orphan.kegPath })),
  );

  for (const rack of racks) {
    if (rack.kind === 'failed') {
      return rack;
    }
  }

  const judged = racks.every((rack) => rack.kind === 'succeeded' && isSingleKegRack(rack.value));

  if (!judged) {
    return { kind: 'succeeded', value: { kind: 'notJudged' } };
  }

  return { kind: 'succeeded', value: { kind: 'judged', orphans: orphans } };
}

function isSingleKegRack(entries: DirectoryEntry[] | null): boolean {
  if (entries === null) {
    return false;
  }

  return entries.filter((entry) => entry.kind === 'directory').length === 1;
}
