import type { Environment } from '../../environment/buildEnvironment.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitFvmVersion } from '../exploreUnit.js';
import { loadProjectPinFiles } from '../projectPins/loadProjectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { compareFvmVersionUnit } from './compareFvmVersionUnit.js';
import { loadFvmState } from './loadFvmState.js';
import { FVM_PIN_FILE_KINDS } from './parseFvmrcPins.js';

/** Reads the global version and the unit's pin files again and compares them with the unit. */
export async function recheckFvmVersionUnit(params: {
  unit: ExplorePathUnitFvmVersion;
  environment: Environment;
  platform: ExploreProbePlatform;
  runningProcesses: RunningProcesses | null;
}): Promise<PathUnitRecheck> {
  const state = await loadFvmState({
    pathRules: params.environment.pathRules,
    homeDir: params.environment.homeDir,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (state.kind === 'failed') {
    return state;
  }

  const pinFiles = await loadProjectPinFiles({
    files: params.unit.pinFiles,
    privacyDenialCode: params.platform.privacyDenialCode,
  });
  const toolPins = selectToolPins({ pins: pinFiles, kinds: FVM_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  return compareFvmVersionUnit({
    unit: params.unit,
    state: state.value,
    toolPins: toolPins.value,
    runningProcesses: params.runningProcesses,
  });
}
