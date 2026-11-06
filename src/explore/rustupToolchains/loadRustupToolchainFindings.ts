import { stubPartNotBuilt } from '../../notBuilt.js';
import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';

/** Offers each toolchain `rustup toolchain list` gives that is not the default and no project pins. */
export function loadRustupToolchainFindings(_params: {
  run: ExploreProbeToolRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeToolResult> {
  return Promise.resolve(
    stubPartNotBuilt<ExploreProbeToolResult>({
      kind: 'failed',
      failure: { reason: 'placeMissing' },
    }),
  );
}
