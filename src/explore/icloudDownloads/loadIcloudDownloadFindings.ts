import { stubPartNotBuilt } from '../../notBuilt.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';

/**
 * Walks the platform's iCloud Drive folder for downloaded files untouched since the cutoff, one
 * evict unit per folder; `placeMissing` where the platform has no iCloud Drive.
 */
export function loadIcloudDownloadFindings(
  _run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  return Promise.resolve(
    stubPartNotBuilt<ExploreProbeFilesResult>({
      kind: 'failed',
      failure: { reason: 'placeMissing' },
    }),
  );
}
