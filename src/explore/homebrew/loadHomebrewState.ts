import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreToolCommandRun } from '../exploreProbe.js';
import type { ExploreToolFailure } from '../exploreUnit.js';
import { loadProbeOutput } from '../loadProbeOutput.js';
import type { HomebrewOldVersions } from './buildHomebrewOldVersions.js';
import { buildHomebrewOldVersions } from './buildHomebrewOldVersions.js';
import { parseHomebrewAutoremoveDryRun } from './parseHomebrewAutoremoveDryRun.js';
import { parseHomebrewCellarPath } from './parseHomebrewCellarPath.js';
import { parseHomebrewCleanupDryRun } from './parseHomebrewCleanupDryRun.js';
import type { HomebrewFormulaName } from './parseHomebrewFormulaName.js';

/** A formula `brew autoremove -n` lists, with its keg folder `<cellar>/<formula>`. */
export type HomebrewOrphan = { formula: HomebrewFormulaName; kegPath: AbsolutePath };

/** What `brew --cellar`, `brew cleanup -n`, and `brew autoremove -n` of one brew answered. */
export type HomebrewState = {
  cellarPath: AbsolutePath;
  oldVersions: HomebrewOldVersions[];
  orphans: HomebrewOrphan[];
};

/**
 * Runs the three read-only commands of the located brew once, each with the time left before the
 * run's deadline, for its probe and the rechecks of its units. The first failed command ends it.
 */
export async function loadHomebrewState(
  run: ExploreToolCommandRun,
): Promise<Result<HomebrewState, ExploreToolFailure>> {
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

  const orphans = orphanFormulae.value.map((formula) => ({
    formula: formula,
    kegPath: buildHomebrewKegFolderPath({ cellarPath: cellarPath.value, formula: formula }),
  }));

  return {
    kind: 'succeeded',
    value: { cellarPath: cellarPath.value, oldVersions: oldVersions.value, orphans: orphans },
  };
}

function buildHomebrewKegFolderPath(params: {
  cellarPath: AbsolutePath;
  formula: HomebrewFormulaName;
}): AbsolutePath {
  // An absolute path with a formula name appended stays absolute.
  return `${params.cellarPath}/${params.formula}` as AbsolutePath;
}
