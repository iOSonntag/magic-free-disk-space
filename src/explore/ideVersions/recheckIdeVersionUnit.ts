import type { Environment } from '../../environment/buildEnvironment.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitIdeVersionFolder } from '../exploreUnit.js';
import { compareIdeVersionUnit } from './compareIdeVersionUnit.js';
import { loadIdeVersionState } from './loadIdeVersionState.js';
import { loadRunningIdes } from './loadRunningIdes.js';

/** Reads the product's version folders and the running IDEs again and compares them with the unit. */
export async function recheckIdeVersionUnit(params: {
  unit: ExplorePathUnitIdeVersionFolder;
  environment: Environment;
  platform: ExploreProbePlatform;
  runningProcesses: RunningProcesses | null;
}): Promise<PathUnitRecheck> {
  const folders = await loadIdeVersionState({
    pathRules: params.environment.pathRules,
    homeDir: params.environment.homeDir,
    roots: params.platform.explore.ideVersionRoots,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (folders.kind === 'failed') {
    return folders;
  }

  const runningIdes = await loadRunningIdes({
    runningProcesses: params.runningProcesses,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  return compareIdeVersionUnit({
    unit: params.unit,
    folders: folders.value,
    runningIdes: runningIdes,
    runningProcesses: params.runningProcesses,
  });
}
