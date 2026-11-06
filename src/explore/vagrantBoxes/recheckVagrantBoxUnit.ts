import { throwPartNotBuilt } from '../../notBuilt.js';
import type { UnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitVagrantBoxVersion } from '../exploreUnit.js';

/** Lists the boxes again and compares the unit's version with the list, right before its remove. */
export function recheckVagrantBoxUnit(_params: {
  unit: ExploreToolUnitVagrantBoxVersion;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  return throwPartNotBuilt();
}
