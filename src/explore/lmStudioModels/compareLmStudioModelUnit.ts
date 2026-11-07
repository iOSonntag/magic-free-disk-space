import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitLmStudioModel } from '../exploreUnit.js';
import type { LmStudioModelFolder } from './loadLmStudioModelState.js';

/** Unchanged while the unit's folder is still one of the fresh model folders, and LM Studio idle. */
export function compareLmStudioModelUnit(params: {
  unit: ExplorePathUnitLmStudioModel;
  folders: LmStudioModelFolder[];
  processCommands: string[] | null;
}): UnitComparison {
  if (!params.folders.some((folder) => folder.path === params.unit.folderPath)) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'lmStudio' },
    processCommands: params.processCommands,
  });
}
