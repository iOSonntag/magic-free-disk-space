import type { Environment } from '../../environment/buildEnvironment.js';
import { throwPartNotBuilt } from '../../notBuilt.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitOllamaModel } from '../exploreUnit.js';

/**
 * Reads the manifests again and compares the model with the unit: the same manifest, and blobs
 * no other model shares, while Ollama is not running.
 */
export function recheckOllamaModelUnit(_params: {
  unit: ExplorePathUnitOllamaModel;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return throwPartNotBuilt();
}
