import type { Environment } from '../../environment/buildEnvironment.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitOllamaModel } from '../exploreUnit.js';
import { compareOllamaModelUnit } from './compareOllamaModelUnit.js';
import { loadOllamaModelState } from './loadOllamaModelState.js';

/**
 * Reads the manifests again and compares the model with the unit: the same manifest, and blobs
 * no other model shares, while Ollama is not running.
 */
export async function recheckOllamaModelUnit(params: {
  unit: ExplorePathUnitOllamaModel;
  environment: Environment;
  platform: ExploreProbePlatform;
  runningProcesses: RunningProcesses | null;
}): Promise<PathUnitRecheck> {
  const state = await loadOllamaModelState({
    pathRules: params.environment.pathRules,
    homeDir: params.environment.homeDir,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (state.kind === 'failed') {
    return state;
  }

  return compareOllamaModelUnit({
    unit: params.unit,
    state: state.value,
    runningProcesses: params.runningProcesses,
  });
}
