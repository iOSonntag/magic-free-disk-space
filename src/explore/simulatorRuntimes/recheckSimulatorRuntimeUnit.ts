import type { Result } from '../../result.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreProbeFailure, ExploreToolUnitSimulatorRuntime } from '../exploreUnit.js';
import { hasAvailableSimulatorDevice } from './buildSimulatorRuntimeFindings.js';
import type { SimulatorRuntimeState } from './loadSimulatorRuntimeState.js';
import { loadSimulatorRuntimeState } from './loadSimulatorRuntimeState.js';

/**
 * Unchanged while the runtime is still listed and deletable with the same last use, still no
 * available device runs on it, and Simulator.app does not run.
 */
export async function recheckSimulatorRuntimeUnit(params: {
  unit: ExploreToolUnitSimulatorRuntime;
  run: ExploreUnitRecheckRun;
}): Promise<Result<UnitComparison, ExploreProbeFailure>> {
  const state = await loadSimulatorRuntimeState(params.run);

  if (state.kind === 'failed') {
    return state;
  }

  const comparison = compareSimulatorRuntime({
    unit: params.unit,
    state: state.value,
    processCommands: params.run.processCommands,
  });

  return { kind: 'succeeded', value: comparison };
}

/**
 * Changed unless the runtime is listed with the same identifier, image, and last use, is still
 * deletable, and no available device runs on it; the last use is compared for equality, never
 * against a cutoff.
 */
export function compareSimulatorRuntime(params: {
  unit: ExploreToolUnitSimulatorRuntime;
  state: SimulatorRuntimeState;
  processCommands: string[] | null;
}): UnitComparison {
  const runtime = params.state.runtimes.find(
    (listed) => listed.runtimeId === params.unit.runtimeId,
  );

  if (
    runtime === undefined ||
    !runtime.isDeletable ||
    runtime.lastUsedAtMs !== params.unit.lastUsedAtMs ||
    runtime.runtimeIdentifier !== params.unit.runtimeIdentifier ||
    runtime.imagePath !== params.unit.imagePath ||
    hasAvailableSimulatorDevice({
      runtimeIdentifier: runtime.runtimeIdentifier,
      devices: params.state.devices,
    })
  ) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'simulatorRuntime' },
    processCommands: params.processCommands,
  });
}
