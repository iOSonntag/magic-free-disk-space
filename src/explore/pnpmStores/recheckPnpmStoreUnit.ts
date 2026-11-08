import type { Environment } from '../../environment/buildEnvironment.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitPnpmStore } from '../exploreUnit.js';
import { loadProjectPinFiles } from '../projectPins/loadProjectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { comparePnpmStoreUnit } from './comparePnpmStoreUnit.js';
import { loadPnpmInstallState } from './loadPnpmInstallState.js';
import { loadPnpmStoreState } from './loadPnpmStoreState.js';
import { PNPM_PIN_FILE_KINDS, toolPinsToPnpmPins } from './parsePnpmPins.js';

/** Reads the unit's store, the installed pnpm, and its pin files again and compares them. */
export async function recheckPnpmStoreUnit(params: {
  unit: ExplorePathUnitPnpmStore;
  environment: Environment;
  platform: ExploreProbePlatform;
  runningProcesses: RunningProcesses | null;
}): Promise<PathUnitRecheck> {
  const storeState = await loadPnpmStoreState({
    pathRules: params.environment.pathRules,
    storeRoot: params.unit.storeRoot,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (storeState.kind === 'failed') {
    return storeState;
  }

  const installState = await loadPnpmInstallState({
    environment: params.environment,
    places: params.platform.explore.pnpmInstallPlaces,
    homebrewPrefixPaths: params.platform.homebrewPrefixPaths,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (installState.kind === 'failed') {
    return installState;
  }

  const pinFiles = await loadProjectPinFiles({
    files: params.unit.pinFiles,
    privacyDenialCode: params.platform.privacyDenialCode,
  });
  const toolPins = selectToolPins({ pins: pinFiles, kinds: PNPM_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  return comparePnpmStoreUnit({
    unit: params.unit,
    storeState: storeState.value,
    installState: installState.value,
    pins: toolPinsToPnpmPins({ toolPins: toolPins.value }),
    runningProcesses: params.runningProcesses,
  });
}
