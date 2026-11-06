import type { Environment } from '../../environment/buildEnvironment.js';
import { throwPartNotBuilt } from '../../notBuilt.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitFvmVersion } from '../exploreUnit.js';

/** Reads the global version and the unit's pin files again and compares them with the unit. */
export function recheckFvmVersionUnit(_params: {
  unit: ExplorePathUnitFvmVersion;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return throwPartNotBuilt();
}
