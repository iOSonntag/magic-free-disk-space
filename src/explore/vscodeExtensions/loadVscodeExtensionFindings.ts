import type { Result } from '../../result.js';
import type { ExploreProbeRun } from '../exploreProbe.js';
import type { ExploreFileUnreadable, ExploreProbeFindings } from '../exploreUnit.js';

/**
 * The extension folders no registry lists that are obsolete or an older version. Not judged until
 * part 2B3 builds it, so its entry stays advice.
 */
export async function loadVscodeExtensionFindings(
  _run: ExploreProbeRun,
): Promise<Result<ExploreProbeFindings, ExploreFileUnreadable>> {
  return { kind: 'succeeded', value: { findings: [], isComplete: false } };
}
