import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExplorePathUnitNvmVersion } from '../exploreUnit.js';
import { loadProjectPinFiles } from '../projectPins/loadProjectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { compareNvmVersionUnit } from './compareNvmVersionUnit.js';
import { loadNvmState } from './loadNvmState.js';
import { NVM_PIN_FILE_KINDS } from './parseNvmrcPin.js';

/** Reads the versions, the aliases, and the unit's pin files again and compares them with it. */
export async function recheckNvmVersionUnit(params: {
  unit: ExplorePathUnitNvmVersion;
  environment: Environment;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  const state = await loadNvmState({ homeDir: params.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  const pinFiles = await loadProjectPinFiles({ files: params.unit.pinFiles });
  const toolPins = selectToolPins({ pins: pinFiles, kinds: NVM_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  return compareNvmVersionUnit({
    unit: params.unit,
    state: state.value,
    toolPins: toolPins.value,
    processCommands: params.processCommands,
  });
}
