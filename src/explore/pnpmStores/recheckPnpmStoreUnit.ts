import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExplorePathUnitPnpmStore } from '../exploreUnit.js';
import { loadExploreRealPath } from '../loadExploreRead.js';
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
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  const storeState = await loadPnpmStoreState({ storeRoot: params.unit.storeRoot });

  if (storeState.kind === 'failed') {
    return storeState;
  }

  const storeRootRealPath = await loadExploreRealPath({ path: params.unit.storeRoot });

  if (storeRootRealPath.kind === 'failed') {
    return storeRootRealPath;
  }

  if (storeRootRealPath.value === null) {
    return { kind: 'changed' };
  }

  const installState = await loadPnpmInstallState({
    homeDir: params.environment.homeDir,
    homebrewPrefixPaths: params.environment.homebrewPrefixPaths,
  });

  if (installState.kind === 'failed') {
    return installState;
  }

  const pinFiles = await loadProjectPinFiles({ files: params.unit.pinFiles });
  const toolPins = selectToolPins({ pins: pinFiles, kinds: PNPM_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  return comparePnpmStoreUnit({
    unit: params.unit,
    storeState: storeState.value,
    storeRootRealPath: storeRootRealPath.value,
    installState: installState.value,
    pins: toolPinsToPnpmPins({ toolPins: toolPins.value }),
    processCommands: params.processCommands,
  });
}
