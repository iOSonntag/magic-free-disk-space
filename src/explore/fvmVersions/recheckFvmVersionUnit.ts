import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitFvmVersion } from '../exploreUnit.js';
import { loadProjectPinFiles } from '../projectPins/loadProjectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { decideFvmVersionOffers } from './decideFvmVersionOffers.js';
import { loadFvmState } from './loadFvmState.js';
import { FVM_PIN_FILE_KINDS } from './parseFvmrcPins.js';

/**
 * Reads the global version and the unit's pin files again and compares them with the unit:
 * unchanged while still offered at the same folder, and no process runs from it.
 */
export async function recheckFvmVersionUnit(params: {
  unit: ExplorePathUnitFvmVersion;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
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

  const isStillOffered = decideFvmVersionOffers({
    state: state.value,
    toolPins: toolPins.value,
  }).some(
    (folder) =>
      folder.version === params.unit.version && folder.folderPath === params.unit.folderPath,
  );

  if (!isStillOffered) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'versionFolder', folderPath: params.unit.folderPath },
    processCommands: params.processCommands,
  });
}
