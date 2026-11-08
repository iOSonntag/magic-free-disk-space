import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type {
  ExploreFoundPaths,
  ExplorePathUnitHuggingFaceDetachedRevisions,
  ExplorePathUnitHuggingFacePartialDownloads,
  ExplorePathUnitHuggingFaceRepository,
} from '../exploreUnit.js';
import { hasSamePaths } from '../hasSamePaths.js';
import {
  decideHuggingFacePartialOffer,
  decideHuggingFaceRevisionOffers,
} from './decideHuggingFaceRepoOffers.js';
import type { HuggingFaceRepoState } from './loadHuggingFaceHubState.js';

/**
 * Unchanged while the repository still offers the unit's kind with exactly the paths of the scan,
 * so a download or a ref moved since keeps everything, and while the CLI is idle. A partial unit
 * is judged against the cutoff of its scan, so a blob that turned stale since stays out of it.
 */
export function compareHuggingFaceUnit(params: {
  unit:
    | ExplorePathUnitHuggingFaceRepository
    | ExplorePathUnitHuggingFaceDetachedRevisions
    | ExplorePathUnitHuggingFacePartialDownloads;
  repo: HuggingFaceRepoState | null;
  processCommands: string[] | null;
}): UnitComparison {
  if (params.repo === null) {
    return { kind: 'changed' };
  }

  const offerPaths = findOfferPaths({ unit: params.unit, repo: params.repo });

  if (offerPaths === null || !hasSamePaths({ left: offerPaths, right: params.unit.foundPaths })) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'huggingFace' },
    processCommands: params.processCommands,
  });
}

/** The paths the repository offers now for the unit's kind; `null` when it offers none. */
function findOfferPaths(params: {
  unit:
    | ExplorePathUnitHuggingFaceRepository
    | ExplorePathUnitHuggingFaceDetachedRevisions
    | ExplorePathUnitHuggingFacePartialDownloads;
  repo: HuggingFaceRepoState;
}): ExploreFoundPaths | null {
  switch (params.unit.kind) {
    case 'huggingFacePartialDownloads':
      return (
        decideHuggingFacePartialOffer({
          repo: params.repo,
          partialCutoffMs: params.unit.cutoffMs,
        })?.paths ?? null
      );
    case 'huggingFaceRepository':
    case 'huggingFaceDetachedRevisions': {
      const kind = params.unit.kind;

      return (
        decideHuggingFaceRevisionOffers({ repo: params.repo })?.find(
          (candidate) => candidate.kind === kind,
        )?.paths ?? null
      );
    }
  }
}
