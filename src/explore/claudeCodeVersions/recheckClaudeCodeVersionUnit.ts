import type { Environment } from '../../environment/buildEnvironment.js';
import { throwPartNotBuilt } from '../../notBuilt.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitClaudeCodeVersion } from '../exploreUnit.js';

/** Reads the versions again and compares them with the unit: still not the current one. */
export function recheckClaudeCodeVersionUnit(_params: {
  unit: ExplorePathUnitClaudeCodeVersion;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return throwPartNotBuilt();
}
