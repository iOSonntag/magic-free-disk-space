import { stubPartNotBuilt } from '../../notBuilt.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';

/**
 * Reads the refs and snapshot links of each repository in the Hugging Face hub cache, with at
 * most three units per repository whose targets partition its files.
 */
export function loadHuggingFaceRepoFindings(
  _run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  return Promise.resolve(
    stubPartNotBuilt<ExploreProbeFilesResult>({
      kind: 'failed',
      failure: { reason: 'placeMissing' },
    }),
  );
}
