import { throwPartNotBuilt } from '../../notBuilt.js';
import type { UnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitRustupToolchain } from '../exploreUnit.js';

/**
 * Lists the toolchains and reads the unit's pin files again, and compares them with the unit,
 * right before its uninstall.
 */
export function recheckRustupToolchainUnit(_params: {
  unit: ExploreToolUnitRustupToolchain;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  return throwPartNotBuilt();
}
