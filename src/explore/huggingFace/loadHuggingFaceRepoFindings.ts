import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import { buildHuggingFaceRepoFindings } from './buildHuggingFaceRepoFindings.js';
import { HUGGING_FACE_PARTIAL_UNTOUCHED_MS } from './decideHuggingFaceRepoOffers.js';
import { loadHuggingFaceHubState } from './loadHuggingFaceHubState.js';

/**
 * The repositories of the Hugging Face hub cache, each split into its current revisions, its
 * detached ones, and its stale partial blobs. The token files beside the hub are never read.
 */
export async function loadHuggingFaceRepoFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  const repos = await loadHuggingFaceHubState({
    pathRules: run.environment.pathRules,
    homeDir: run.environment.homeDir,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  if (repos.kind === 'failed') {
    return repos;
  }

  return {
    kind: 'succeeded',
    value: buildHuggingFaceRepoFindings({
      repos: repos.value,
      partialCutoffMs: run.environment.nowMs - HUGGING_FACE_PARTIAL_UNTOUCHED_MS,
      processCommands: run.processCommands,
    }),
  };
}
