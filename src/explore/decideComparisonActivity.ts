import type { ResultFailed } from '../result.js';
import type { UnitActivityFacts } from './decideUnitActivity.js';
import { decideUnitActivity } from './decideUnitActivity.js';
import type { ExploreProbeFailure } from './exploreUnit.js';

export type UnitComparisonUnchanged = { kind: 'unchanged' };

export type UnitComparisonChanged = { kind: 'changed' };

/** The unit's tool or app works on it now, or its busy rule could not read the processes. */
export type UnitComparisonBusy = { kind: 'busy' };

/** The answer of a comparison of a fresh probe with the unit. */
export type UnitComparison = UnitComparisonUnchanged | UnitComparisonChanged | UnitComparisonBusy;

/** The answer of a tool recheck: its comparison, or the failure of its fresh probe. */
export type UnitRecheck = UnitComparison | ResultFailed<ExploreProbeFailure>;

/**
 * The end of every compare once the unit is still offered: an unknown activity counts as busy, so
 * a unit runs only when its rule saw it idle.
 */
export function decideComparisonActivity(params: {
  facts: UnitActivityFacts;
  processCommands: string[] | null;
}): UnitComparison {
  const activity = decideUnitActivity(params);

  switch (activity) {
    case 'idle':
      return { kind: 'unchanged' };
    case 'busy':
    case 'unknown':
      return { kind: 'busy' };
  }
}
