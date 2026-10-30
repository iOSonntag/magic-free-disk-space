import type { Result } from '../../result.js';
import type { ExploreProbeToolRun } from '../exploreProbe.js';
import type { ExploreProbeFailure, ExploreProbeFindings } from '../exploreUnit.js';

/**
 * The deletable runtimes not used since the cutoff that no available device runs on. Not judged
 * until part 2B2 builds it, so its entry stays advice.
 */
export async function loadSimulatorRuntimeFindings(
  _run: ExploreProbeToolRun,
): Promise<Result<ExploreProbeFindings, ExploreProbeFailure>> {
  return { kind: 'succeeded', value: { findings: [], isComplete: false } };
}
