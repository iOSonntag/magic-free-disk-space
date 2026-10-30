import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { UnitComparison, UnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitHomebrew } from '../exploreUnit.js';
import { listUnitPaths } from '../exploreUnit.js';
import type { HomebrewOrphans } from './decideHomebrewOrphans.js';
import { decideHomebrewOrphans } from './decideHomebrewOrphans.js';
import type { HomebrewState } from './loadHomebrewState.js';
import { loadHomebrewState } from './loadHomebrewState.js';

/** Unchanged while the fresh unit paths are a non-empty subset of the scanned ones, and idle. */
export async function recheckHomebrewUnit(params: {
  unit: ExploreToolUnitHomebrew;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  const state = await loadHomebrewState(params.run);

  if (state.kind === 'failed') {
    return state;
  }

  return compareHomebrewUnit({
    unit: params.unit,
    state: state.value,
    processCommands: params.run.processCommands,
  });
}

/**
 * `changed` when the fresh state offers no path of the unit any more, or one the scan did not
 * offer, which also covers a Cellar that moved and orphans not judged; else busy or not by the
 * Homebrew rule.
 */
export function compareHomebrewUnit(params: {
  unit: ExploreToolUnitHomebrew;
  state: HomebrewState;
  processCommands: string[] | null;
}): UnitComparison {
  const freshUnitPaths = listFreshHomebrewUnitPaths({ unit: params.unit, state: params.state });
  const scannedUnitPaths = new Set(listUnitPaths(params.unit));

  if (freshUnitPaths.length === 0 || freshUnitPaths.some((path) => !scannedUnitPaths.has(path))) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'homebrew' },
    processCommands: params.processCommands,
  });
}

function listFreshHomebrewUnitPaths(params: {
  unit: ExploreToolUnitHomebrew;
  state: HomebrewState;
}): AbsolutePath[] {
  switch (params.unit.kind) {
    case 'homebrewOldVersions': {
      const formula = params.unit.formula;
      const oldVersions = params.state.oldVersions.find(
        (candidate) => candidate.formula === formula,
      );

      return oldVersions === undefined ? [] : oldVersions.kegs.map((keg) => keg.path);
    }
    case 'homebrewOrphans':
      return listFreshHomebrewOrphanRackPaths(
        decideHomebrewOrphans({ orphans: params.state.orphans }),
      );
  }
}

function listFreshHomebrewOrphanRackPaths(orphansJudgement: HomebrewOrphans): AbsolutePath[] {
  switch (orphansJudgement.kind) {
    case 'judged':
      return orphansJudgement.orphans.map((orphan) => orphan.rackPath);
    case 'notJudged':
      return [];
  }
}
