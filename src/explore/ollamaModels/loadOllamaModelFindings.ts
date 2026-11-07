import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import { buildOllamaModelFindings } from './buildOllamaModelFindings.js';
import { loadOllamaModelState } from './loadOllamaModelState.js';

/** The models in `~/.ollama/models`, each with the blobs no other model names. */
export async function loadOllamaModelFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  const state = await loadOllamaModelState({
    pathRules: run.environment.pathRules,
    homeDir: run.environment.homeDir,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildOllamaModelFindings({ state: state.value, processCommands: run.processCommands }),
  };
}
