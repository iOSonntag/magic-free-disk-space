import type { Result } from '../../result.js';
import type { ExploreToolCommandRun } from '../exploreProbe.js';
import type { ExploreToolFailure } from '../exploreUnit.js';

/** What `simctl runtime list -j` and `simctl list devices --json` answered. */
export type SimulatorRuntimeState = { runtimeCount: number };

/**
 * Runs the two read-only commands of the located `xcrun` once, each with the time left before the
 * run's deadline, for the probe and the recheck of its units.
 */
export function loadSimulatorRuntimeState(
  _run: ExploreToolCommandRun,
): Promise<Result<SimulatorRuntimeState, ExploreToolFailure>> {
  throw new Error('loadSimulatorRuntimeState is not built yet (part 2B2)');
}
