import { stubPartNotBuilt } from '../../notBuilt.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';

/** Offers each FVM version that is not the global one and that no `.fvmrc` found pins. */
export function loadFvmVersionFindings(_params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  return Promise.resolve(
    stubPartNotBuilt<ExploreProbeFilesResult>({
      kind: 'failed',
      failure: { reason: 'placeMissing' },
    }),
  );
}
