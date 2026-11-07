import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type {
  ExplorePathUnitHuggingFaceDetachedRevisions,
  ExplorePathUnitHuggingFacePartialDownloads,
  ExplorePathUnitHuggingFaceRepository,
} from '../exploreUnit.js';
import { compareHuggingFaceUnit } from './compareHuggingFaceUnit.js';
import { HUGGING_FACE_PARTIAL_UNTOUCHED_MS } from './decideHuggingFaceRepoOffers.js';
import { loadHuggingFaceRepoState } from './loadHuggingFaceHubState.js';

/** Reads the unit's repository again and compares its refs and files with the unit. */
export async function recheckHuggingFaceUnit(params: {
  unit:
    | ExplorePathUnitHuggingFaceRepository
    | ExplorePathUnitHuggingFaceDetachedRevisions
    | ExplorePathUnitHuggingFacePartialDownloads;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  const repo = await loadHuggingFaceRepoState({
    pathRules: params.environment.pathRules,
    repoPath: params.unit.repoPath,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (repo.kind === 'failed') {
    return repo;
  }

  return compareHuggingFaceUnit({
    unit: params.unit,
    repo: repo.value,
    partialCutoffMs: params.environment.nowMs - HUGGING_FACE_PARTIAL_UNTOUCHED_MS,
    processCommands: params.processCommands,
  });
}
