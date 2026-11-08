import type { UnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitRustupToolchain } from '../exploreUnit.js';
import { loadProjectPinFiles } from '../projectPins/loadProjectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { compareRustupToolchainUnit } from './compareRustupToolchainUnit.js';
import { loadRustupState } from './loadRustupState.js';
import { RUSTUP_PIN_FILE_KINDS } from './parseRustToolchainPins.js';

/**
 * Lists the toolchains and reads the unit's pin files again, and compares them with the unit,
 * right before its uninstall.
 */
export async function recheckRustupToolchainUnit(params: {
  unit: ExploreToolUnitRustupToolchain;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  const state = await loadRustupState({
    run: params.run,
    privacyDenialCode: params.run.platform.privacyDenialCode,
  });

  if (state.kind === 'failed') {
    return state;
  }

  const pinFiles = await loadProjectPinFiles({
    files: params.unit.pinFiles,
    privacyDenialCode: params.run.platform.privacyDenialCode,
  });
  const toolPins = selectToolPins({ pins: pinFiles, kinds: RUSTUP_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  return compareRustupToolchainUnit({
    unit: params.unit,
    state: state.value,
    toolPins: toolPins.value,
    runningProcesses: params.run.runningProcesses,
  });
}
