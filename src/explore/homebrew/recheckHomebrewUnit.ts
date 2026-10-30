import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { UnitComparison, UnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitHomebrew } from '../exploreUnit.js';
import type { HomebrewState } from './loadHomebrewState.js';
import { loadHomebrewState } from './loadHomebrewState.js';

/** Unchanged while the fresh lines or list of the unit are a subset of the scanned ones, and idle. */
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
 * `changed` when the fresh state offers no keg of the unit any more, or one the scan did not
 * offer, which also covers a Cellar that moved; else busy or not by the Homebrew rule.
 */
export function compareHomebrewUnit(params: {
  unit: ExploreToolUnitHomebrew;
  state: HomebrewState;
  processCommands: string[] | null;
}): UnitComparison {
  const freshKegPaths = listFreshHomebrewKegPaths({ unit: params.unit, state: params.state });
  const scannedKegPaths = new Set(params.unit.kegPaths);

  if (freshKegPaths.length === 0 || freshKegPaths.some((path) => !scannedKegPaths.has(path))) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'homebrew' },
    processCommands: params.processCommands,
  });
}

function listFreshHomebrewKegPaths(params: {
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
      return params.state.orphans.map((orphan) => orphan.kegPath);
  }
}
