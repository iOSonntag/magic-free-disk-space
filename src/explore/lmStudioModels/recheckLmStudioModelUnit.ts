import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitLmStudioModel } from '../exploreUnit.js';
import { compareLmStudioModelUnit } from './compareLmStudioModelUnit.js';
import { loadLmStudioModelState } from './loadLmStudioModelState.js';

/** Reads the model folders again and compares them with the unit. */
export async function recheckLmStudioModelUnit(params: {
  unit: ExplorePathUnitLmStudioModel;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  const folders = await loadLmStudioModelState({
    pathRules: params.environment.pathRules,
    homeDir: params.environment.homeDir,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (folders.kind === 'failed') {
    return folders;
  }

  return compareLmStudioModelUnit({
    unit: params.unit,
    folders: folders.value,
    processCommands: params.processCommands,
  });
}
