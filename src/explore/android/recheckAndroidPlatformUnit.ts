import type { Environment } from '../../environment/buildEnvironment.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitAndroidPlatform } from '../exploreUnit.js';
import { loadProjectPinFiles } from '../projectPins/loadProjectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { compareAndroidPlatformUnit } from './compareAndroidPlatformUnit.js';
import { loadAndroidPlatformState } from './loadAndroidPlatformState.js';
import { ANDROID_PIN_FILE_KINDS } from './parseAndroidCompileSdkPins.js';

/** Reads the platforms and the unit's pin files again and compares them with the unit. */
export async function recheckAndroidPlatformUnit(params: {
  unit: ExplorePathUnitAndroidPlatform;
  environment: Environment;
  platform: ExploreProbePlatform;
  runningProcesses: RunningProcesses | null;
}): Promise<PathUnitRecheck> {
  const state = await loadAndroidPlatformState({
    pathRules: params.environment.pathRules,
    sdkRoots: [{ path: params.unit.sdkRoot, isRequired: true }],
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (state.kind === 'failed') {
    return state;
  }

  const pinFiles = await loadProjectPinFiles({
    files: params.unit.pinFiles,
    privacyDenialCode: params.platform.privacyDenialCode,
  });
  const toolPins = selectToolPins({ pins: pinFiles, kinds: ANDROID_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  return compareAndroidPlatformUnit({
    unit: params.unit,
    state: state.value,
    toolPins: toolPins.value,
    runningProcesses: params.runningProcesses,
  });
}
