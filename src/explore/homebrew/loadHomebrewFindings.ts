import type { Result } from '../../result.js';
import type { ExploreProbeToolRun } from '../exploreProbe.js';
import type { ExploreProbeFailure, ExploreProbeFindings } from '../exploreUnit.js';
import { buildHomebrewFindings } from './buildHomebrewFindings.js';
import { loadHomebrewState } from './loadHomebrewState.js';

/**
 * The old versions of each formula and the orphans in the Cellar of the located brew, the one
 * builder of both Homebrew probes; all judged once its three commands answered.
 */
export async function loadHomebrewFindings(
  run: ExploreProbeToolRun,
): Promise<Result<ExploreProbeFindings, ExploreProbeFailure>> {
  const state = await loadHomebrewState(run);

  if (state.kind === 'failed') {
    return state;
  }

  const findings = buildHomebrewFindings({
    tool: run.tool,
    state: state.value,
    processCommands: run.processCommands,
  });

  return { kind: 'succeeded', value: { findings: findings, isComplete: true } };
}
