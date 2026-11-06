import type { Environment } from '../../environment/buildEnvironment.js';
import { throwPartNotBuilt } from '../../notBuilt.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type {
  ExplorePathUnitHuggingFaceDetachedRevisions,
  ExplorePathUnitHuggingFacePartialDownloads,
  ExplorePathUnitHuggingFaceRepository,
} from '../exploreUnit.js';

/** Reads the unit's repository again and compares its refs and files with the unit. */
export function recheckHuggingFaceUnit(_params: {
  unit:
    | ExplorePathUnitHuggingFaceRepository
    | ExplorePathUnitHuggingFaceDetachedRevisions
    | ExplorePathUnitHuggingFacePartialDownloads;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return throwPartNotBuilt();
}
