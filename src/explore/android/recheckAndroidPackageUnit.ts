import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitAndroidPackage } from '../exploreUnit.js';
import { compareAndroidPathUnit } from './compareAndroidPathUnit.js';
import { loadAndroidSdkState } from './loadAndroidSdkState.js';

/** Reads the unit's SDK and the AVDs again and compares them with the unit. */
export async function recheckAndroidPackageUnit(params: {
  unit: ExplorePathUnitAndroidPackage;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  const state = await loadAndroidSdkState({
    pathRules: params.environment.pathRules,
    homeDir: params.environment.homeDir,
    sdkRoots: [{ path: params.unit.sdkRoot, isRequired: true }],
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (state.kind === 'failed') {
    return state;
  }

  return compareAndroidPathUnit({
    unit: params.unit,
    state: state.value,
    processCommands: params.processCommands,
  });
}
