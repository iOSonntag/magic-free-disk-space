import type { Environment } from '../../environment/buildEnvironment.js';
import { throwPartNotBuilt } from '../../notBuilt.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitClaudeTranscripts } from '../exploreUnit.js';

/** Reads the project folder again and compares its transcripts older than the cutoff with the unit. */
export function recheckClaudeTranscriptsUnit(_params: {
  unit: ExplorePathUnitClaudeTranscripts;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return throwPartNotBuilt();
}
