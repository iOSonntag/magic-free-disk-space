import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';
import { buildHomebrewFindings } from './buildHomebrewFindings.js';
import { loadHomebrewState } from './loadHomebrewState.js';

/**
 * The old versions of each formula and the orphans in the Cellar of the located brew, the one
 * builder of both Homebrew probes; not complete while a rack of an orphan holds back the orphans.
 */
export async function loadHomebrewFindings(
  run: ExploreProbeToolRun,
): Promise<ExploreProbeToolResult> {
  const state = await loadHomebrewState(run);

  if (state.kind === 'failed') {
    return state;
  }

  const probeFindings = buildHomebrewFindings({
    tool: run.tool,
    state: state.value,
    processCommands: run.processCommands,
  });

  return { kind: 'succeeded', value: probeFindings };
}
