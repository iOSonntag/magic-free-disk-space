import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
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
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  const state = await loadAndroidPlatformState({ homeDir: params.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  const pinFiles = await loadProjectPinFiles({ files: params.unit.pinFiles });
  const toolPins = selectToolPins({ pins: pinFiles, kinds: ANDROID_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  return compareAndroidPlatformUnit({
    unit: params.unit,
    state: state.value,
    toolPins: toolPins.value,
    processCommands: params.processCommands,
  });
}
