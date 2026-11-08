import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreToolUnitRustupToolchain } from '../exploreUnit.js';
import type { ToolPins } from '../projectPins/selectToolPins.js';
import { decideRustupToolchainOffers } from './decideRustupToolchainOffers.js';
import type { RustupState } from './loadRustupState.js';

/**
 * Unchanged while the fresh list and pins still offer the unit's toolchain at the same folder, and
 * while no rustup program or program of the toolchain's own runs.
 */
export function compareRustupToolchainUnit(params: {
  unit: ExploreToolUnitRustupToolchain;
  state: RustupState;
  toolPins: ToolPins;
  runningProcesses: RunningProcesses | null;
}): UnitComparison {
  const isStillOffered = decideRustupToolchainOffers({
    state: params.state,
    toolPins: params.toolPins,
  }).some(
    (toolchain) =>
      toolchain.name === params.unit.name && toolchain.toolchainPath === params.unit.toolchainPath,
  );

  if (!isStillOffered) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'rustup', toolchainPath: params.unit.toolchainPath },
    runningProcesses: params.runningProcesses,
  });
}
