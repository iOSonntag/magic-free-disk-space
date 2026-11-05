import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitClaudeTranscripts } from '../exploreUnit.js';
import { hasSamePaths } from '../hasSamePaths.js';
import { decideOldTranscriptPaths } from './decideOldTranscriptPaths.js';
import type { ClaudeProjectState } from './loadClaudeProjectsState.js';

/**
 * Unchanged while the project's transcripts older than the scan's cutoff are exactly the unit's,
 * so a conversation resumed since, or a new one, changes it; `project` is `null` once it is gone.
 */
export function compareClaudeTranscriptsUnit(params: {
  unit: ExplorePathUnitClaudeTranscripts;
  project: ClaudeProjectState | null;
  runningProcesses: RunningProcesses | null;
}): UnitComparison {
  if (params.project === null) {
    return { kind: 'changed' };
  }

  const old = decideOldTranscriptPaths({ project: params.project, cutoffMs: params.unit.cutoffMs });

  if (!hasSamePaths({ left: old.paths, right: params.unit.foundPaths })) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'untouchedFiles' },
    runningProcesses: params.runningProcesses,
  });
}
