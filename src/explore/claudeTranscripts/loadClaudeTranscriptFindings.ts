import { stubPartNotBuilt } from '../../notBuilt.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';

/** Finds the Claude Code transcripts older than the cutoff, one unit per project. */
export function loadClaudeTranscriptFindings(
  _run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  return Promise.resolve(
    stubPartNotBuilt<ExploreProbeFilesResult>({
      kind: 'failed',
      failure: { reason: 'placeMissing' },
    }),
  );
}
