import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import { buildClaudeTranscriptFindings } from './buildClaudeTranscriptFindings.js';
import { CLAUDE_TRANSCRIPT_UNTOUCHED_MS } from './decideOldTranscriptPaths.js';
import { loadClaudeProjectsState } from './loadClaudeProjectsState.js';

/** The conversations of each Claude Code project untouched for 30 days. */
export async function loadClaudeTranscriptFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  const projects = await loadClaudeProjectsState({
    pathRules: run.environment.pathRules,
    homeDir: run.environment.homeDir,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  if (projects.kind === 'failed') {
    return projects;
  }

  return {
    kind: 'succeeded',
    value: buildClaudeTranscriptFindings({
      projects: projects.value,
      cutoffMs: run.environment.nowMs - CLAUDE_TRANSCRIPT_UNTOUCHED_MS,
      processCommands: run.processCommands,
    }),
  };
}
