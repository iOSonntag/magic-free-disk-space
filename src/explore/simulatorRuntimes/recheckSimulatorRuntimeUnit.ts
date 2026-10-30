import type { Result } from '../../result.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreProbeFailure, ExploreToolUnitSimulatorRuntime } from '../exploreUnit.js';

/**
 * Unchanged while the runtime is still listed and deletable with the same last use, still no
 * available device runs on it, and Simulator.app does not run.
 */
export function recheckSimulatorRuntimeUnit(_params: {
  unit: ExploreToolUnitSimulatorRuntime;
  run: ExploreUnitRecheckRun;
}): Promise<Result<UnitComparison, ExploreProbeFailure>> {
  throw new Error('recheckSimulatorRuntimeUnit is not built yet (part 2B2)');
}
