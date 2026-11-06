import type { Environment } from '../../environment/buildEnvironment.js';
import { throwPartNotBuilt } from '../../notBuilt.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitMailDownloads } from '../exploreUnit.js';

/** Reads the unit's files again and compares them with the unit, while Mail is not running. */
export function recheckMailDownloadsUnit(_params: {
  unit: ExplorePathUnitMailDownloads;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return throwPartNotBuilt();
}
