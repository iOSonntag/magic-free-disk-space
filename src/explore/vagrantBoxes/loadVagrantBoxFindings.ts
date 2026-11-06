import { stubPartNotBuilt } from '../../notBuilt.js';
import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';

/** Lists the boxes with `vagrant box list` and offers each version a newer one outdates. */
export function loadVagrantBoxFindings(_run: ExploreProbeToolRun): Promise<ExploreProbeToolResult> {
  return Promise.resolve(
    stubPartNotBuilt<ExploreProbeToolResult>({
      kind: 'failed',
      failure: { reason: 'placeMissing' },
    }),
  );
}
