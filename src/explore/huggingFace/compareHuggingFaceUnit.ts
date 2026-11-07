import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type {
  ExplorePathUnitHuggingFaceDetachedRevisions,
  ExplorePathUnitHuggingFacePartialDownloads,
  ExplorePathUnitHuggingFaceRepository,
} from '../exploreUnit.js';
import { hasSamePaths } from '../hasSamePaths.js';
import { decideHuggingFaceRepoOffers } from './decideHuggingFaceRepoOffers.js';
import type { HuggingFaceRepoState } from './loadHuggingFaceHubState.js';

/**
 * Unchanged while the repository still offers the unit's kind with exactly the paths of the scan,
 * so a download or a ref moved since keeps everything, and while the CLI is idle.
 */
export function compareHuggingFaceUnit(params: {
  unit:
    | ExplorePathUnitHuggingFaceRepository
    | ExplorePathUnitHuggingFaceDetachedRevisions
    | ExplorePathUnitHuggingFacePartialDownloads;
  repo: HuggingFaceRepoState | null;
  partialCutoffMs: number;
  processCommands: string[] | null;
}): UnitComparison {
  if (params.repo === null) {
    return { kind: 'changed' };
  }

  const offer = decideHuggingFaceRepoOffers({
    repo: params.repo,
    partialCutoffMs: params.partialCutoffMs,
  }).offers.find((candidate) => candidate.kind === params.unit.kind);

  if (offer === undefined || !hasSamePaths({ left: offer.paths, right: params.unit.foundPaths })) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'huggingFace' },
    processCommands: params.processCommands,
  });
}
