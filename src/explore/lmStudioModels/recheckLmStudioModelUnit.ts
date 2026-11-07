import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitLmStudioModel } from '../exploreUnit.js';
import { loadLmStudioModelState } from './loadLmStudioModelState.js';

/** Reads the model folders again: unchanged while the unit's folder is still one, and LM Studio idle. */
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

  if (!folders.value.some((folder) => folder.path === params.unit.folderPath)) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'lmStudio' },
    processCommands: params.processCommands,
  });
}
