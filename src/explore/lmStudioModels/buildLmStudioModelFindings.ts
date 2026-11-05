import type { RunningProcesses } from '../../system/systemPlatform.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings } from '../exploreUnit.js';
import type { LmStudioModelFolder } from './loadLmStudioModelState.js';

/** Offers each model folder, in use while LM Studio runs. */
export function buildLmStudioModelFindings(params: {
  folders: LmStudioModelFolder[];
  runningProcesses: RunningProcesses | null;
}): ExploreProbeFindings {
  return {
    findings: params.folders.map((folder) =>
      buildLmStudioModelFinding({ folder: folder, runningProcesses: params.runningProcesses }),
    ),
    isComplete: true,
  };
}

function buildLmStudioModelFinding(params: {
  folder: LmStudioModelFolder;
  runningProcesses: RunningProcesses | null;
}): ExploreFinding {
  return {
    unit: {
      kind: 'lmStudioModel',
      publisher: params.folder.publisher,
      modelName: params.folder.modelName,
      folderPath: params.folder.path,
      downloadedAtMs: params.folder.modifiedMs,
    },
    title: `LM Studio model ${params.folder.publisher}/${params.folder.modelName}`,
    explanation: 'A local AI model LM Studio downloaded, with every file of it.',
    regeneration: 'LM Studio downloads it again when you get this model again.',
    risk: 'review',
    evidenceLines: ['LM Studio keeps one folder per publisher and model in its models folder.'],
    displayPath: params.folder.path,
    activity: decideUnitActivity({
      facts: { kind: 'lmStudio' },
      runningProcesses: params.runningProcesses,
    }),
  };
}
