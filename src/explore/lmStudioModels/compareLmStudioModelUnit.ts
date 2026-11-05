import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitLmStudioModel } from '../exploreUnit.js';
import type { LmStudioModelFolder } from './loadLmStudioModelState.js';

/**
 * Unchanged while the unit's folder is still a model folder with the change time the scan saw, so
 * no file came or went since, and LM Studio idle.
 */
export function compareLmStudioModelUnit(params: {
  unit: ExplorePathUnitLmStudioModel;
  folders: LmStudioModelFolder[];
  runningProcesses: RunningProcesses | null;
}): UnitComparison {
  const folder = params.folders.find((modelFolder) => modelFolder.path === params.unit.folderPath);

  if (folder === undefined || folder.modifiedMs !== params.unit.downloadedAtMs) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'lmStudio' },
    runningProcesses: params.runningProcesses,
  });
}
