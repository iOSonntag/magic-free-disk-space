import type { Result } from '../../result.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreProbeFailure, ExploreToolUnitAndroidAvd } from '../exploreUnit.js';

/** Unchanged while the AVD is still listed at the same path with the same last use, and idle. */
export function recheckAndroidAvdUnit(_params: {
  unit: ExploreToolUnitAndroidAvd;
  run: ExploreUnitRecheckRun;
}): Promise<Result<UnitComparison, ExploreProbeFailure>> {
  throw new Error('recheckAndroidAvdUnit is not built yet (part 2A)');
}
