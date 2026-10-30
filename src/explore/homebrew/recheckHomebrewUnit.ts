import type { Result } from '../../result.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type {
  ExploreProbeFailure,
  ExploreToolUnitHomebrewOldVersions,
  ExploreToolUnitHomebrewOrphans,
} from '../exploreUnit.js';

/** Unchanged while the fresh lines or list of the unit are a subset of the scanned ones, and idle. */
export function recheckHomebrewUnit(_params: {
  unit: ExploreToolUnitHomebrewOldVersions | ExploreToolUnitHomebrewOrphans;
  run: ExploreUnitRecheckRun;
}): Promise<Result<UnitComparison, ExploreProbeFailure>> {
  throw new Error('recheckHomebrewUnit is not built yet (part 2B1)');
}
