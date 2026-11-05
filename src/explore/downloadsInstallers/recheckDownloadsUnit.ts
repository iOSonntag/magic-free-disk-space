import type { Environment } from '../../environment/buildEnvironment.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type {
  ExplorePathUnitDownloadsIncomplete,
  ExplorePathUnitDownloadsInstallers,
} from '../exploreUnit.js';
import type { DownloadsFileKind } from './downloadsFiles.js';
import { buildDownloadsActivityFacts, loadLatestModified } from './downloadsFiles.js';

/**
 * Reads the unit's files again and compares them with the unit: each still there with the newest
 * change the scan read, and for partial downloads no browser of their family running.
 */
export async function recheckDownloadsUnit(params: {
  unit: ExplorePathUnitDownloadsInstallers | ExplorePathUnitDownloadsIncomplete;
  environment: Environment;
  platform: ExploreProbePlatform;
  runningProcesses: RunningProcesses | null;
}): Promise<PathUnitRecheck> {
  for (const foundFile of params.unit.foundFiles) {
    const latest = await loadLatestModified({
      path: foundFile.path,
      platform: params.platform,
      deadlineMs: null,
    });

    if (latest.kind === 'failed') {
      return latest;
    }

    if (latest.value?.kind !== 'known' || latest.value.modifiedMs !== foundFile.modifiedMs) {
      return { kind: 'changed' };
    }
  }

  return decideComparisonActivity({
    facts: buildDownloadsActivityFacts({
      fileKind: getDownloadsUnitFileKind({ unit: params.unit }),
      environment: params.environment,
      platform: params.platform,
    }),
    runningProcesses: params.runningProcesses,
  });
}

function getDownloadsUnitFileKind(params: {
  unit: ExplorePathUnitDownloadsInstallers | ExplorePathUnitDownloadsIncomplete;
}): DownloadsFileKind {
  switch (params.unit.kind) {
    case 'downloadsInstallers':
      return { kind: 'installer' };
    case 'downloadsIncomplete':
      return { kind: 'incomplete', browserFamily: params.unit.browserFamily };
  }
}
