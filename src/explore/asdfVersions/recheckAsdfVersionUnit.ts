import type { UnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitAsdfVersion } from '../exploreUnit.js';

/** Answers changed, so an asdf version unit is never removed. */
export async function recheckAsdfVersionUnit(params: {
  unit: ExploreToolUnitAsdfVersion;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  return { kind: 'changed' };
}
