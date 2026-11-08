import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import { buildClaudeCodeVersionFindings } from './buildClaudeCodeVersionFindings.js';
import { loadClaudeCodeVersionState } from './loadClaudeCodeVersionState.js';

/**
 * The versions of Claude Code past the `KEPT_NEWEST_COUNT` newest that the `claude` launcher does
 * not run.
 */
export async function loadClaudeCodeVersionFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  const state = await loadClaudeCodeVersionState({
    pathRules: run.environment.pathRules,
    homeDir: run.environment.homeDir,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildClaudeCodeVersionFindings({
      state: state.value,
      processCommands: run.processCommands,
    }),
  };
}
