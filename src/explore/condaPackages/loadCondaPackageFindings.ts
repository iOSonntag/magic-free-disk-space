import { stubPartNotBuilt } from '../../notBuilt.js';
import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';

/** Asks `conda clean --dry-run --json` what its tarball and package cleans would remove. */
export function loadCondaPackageFindings(
  _run: ExploreProbeToolRun,
): Promise<ExploreProbeToolResult> {
  return Promise.resolve(
    stubPartNotBuilt<ExploreProbeToolResult>({
      kind: 'failed',
      failure: { reason: 'placeMissing' },
    }),
  );
}
