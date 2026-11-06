import type { Environment } from '../../environment/buildEnvironment.js';
import { throwPartNotBuilt } from '../../notBuilt.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitIdeVersionFolder } from '../exploreUnit.js';

/** Reads the product's version folders again and compares them with the unit: still an old one. */
export function recheckIdeVersionUnit(_params: {
  unit: ExplorePathUnitIdeVersionFolder;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return throwPartNotBuilt();
}
