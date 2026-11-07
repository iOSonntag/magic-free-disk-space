import type { UnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitRustupToolchain } from '../exploreUnit.js';
import { loadProjectPinFiles } from '../projectPins/loadProjectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { decideRustupToolchainOffers } from './decideRustupToolchainOffers.js';
import { loadRustupState } from './loadRustupState.js';
import { RUSTUP_PIN_FILE_KINDS } from './parseRustToolchainPins.js';

/**
 * Lists the toolchains and reads the unit's pin files again, and compares them with the unit,
 * right before its uninstall: unchanged while still offered at the same folder, and idle.
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

  const isStillOffered = decideRustupToolchainOffers({
    state: state.value,
    toolPins: toolPins.value,
  }).some(
    (toolchain) =>
      toolchain.name === params.unit.name && toolchain.toolchainPath === params.unit.toolchainPath,
  );

  if (!isStillOffered) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'rustup' },
    processCommands: params.run.processCommands,
  });
}
