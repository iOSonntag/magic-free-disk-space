import type { Result } from '../../result.js';
import type { ExploreProbeToolRun } from '../exploreProbe.js';
import type { ExploreProbeFailure, ExploreProbeFindings } from '../exploreUnit.js';

/**
 * The old versions of each formula and the orphans in the Cellar of the located brew, the one
 * builder of both Homebrew probes. Not judged until part 2B1 builds it, so its entries stay advice.
 */
export async function loadHomebrewFindings(
  _run: ExploreProbeToolRun,
): Promise<Result<ExploreProbeFindings, ExploreProbeFailure>> {
  return { kind: 'succeeded', value: { findings: [], isComplete: false } };
}
