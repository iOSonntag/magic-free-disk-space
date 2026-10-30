import type { Result } from '../../result.js';
import type { ExploreProbeToolRun } from '../exploreProbe.js';
import type { ExploreProbeFailure, ExploreProbeFindings } from '../exploreUnit.js';
import { buildSimulatorRuntimeFindings } from './buildSimulatorRuntimeFindings.js';
import { loadSimulatorRuntimeState } from './loadSimulatorRuntimeState.js';

/**
 * The deletable runtimes not used since the cutoff that no available device runs on. Once both
 * commands answered, every runtime is judged.
 */
export async function loadSimulatorRuntimeFindings(
  run: ExploreProbeToolRun,
): Promise<Result<ExploreProbeFindings, ExploreProbeFailure>> {
  const state = await loadSimulatorRuntimeState(run);

  if (state.kind === 'failed') {
    return state;
  }

  const findings = buildSimulatorRuntimeFindings({
    tool: run.tool,
    state: state.value,
    unusedCutoffMs: run.unusedCutoffMs,
    processCommands: run.processCommands,
  });

  return { kind: 'succeeded', value: { findings: findings, isComplete: true } };
}
