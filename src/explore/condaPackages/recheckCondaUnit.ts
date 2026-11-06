import { throwPartNotBuilt } from '../../notBuilt.js';
import type { UnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitCondaPackages, ExploreToolUnitCondaTarballs } from '../exploreUnit.js';

/** Asks the clean's dry run again and compares its paths with the unit, right before the clean. */
export function recheckCondaUnit(_params: {
  unit: ExploreToolUnitCondaTarballs | ExploreToolUnitCondaPackages;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  return throwPartNotBuilt();
}
