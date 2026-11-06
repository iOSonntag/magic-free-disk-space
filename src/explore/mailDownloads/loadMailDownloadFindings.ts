import { stubPartNotBuilt } from '../../notBuilt.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';

/**
 * Finds the attachment copies Mail saved that nobody changed since, older than the cutoff;
 * `placeMissing` where the platform has no such folder.
 */
export function loadMailDownloadFindings(_run: ExploreProbeRun): Promise<ExploreProbeFilesResult> {
  return Promise.resolve(
    stubPartNotBuilt<ExploreProbeFilesResult>({
      kind: 'failed',
      failure: { reason: 'placeMissing' },
    }),
  );
}
