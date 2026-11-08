import { toNonEmpty } from '../../system/nonEmptyList.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreFoundPaths, ExploreProbeFindings } from '../exploreUnit.js';
import { formatDaySpan } from '../formatLimitTexts.js';
import {
  CLAUDE_TRANSCRIPT_UNTOUCHED_MS,
  decideOldTranscriptPaths,
} from './decideOldTranscriptPaths.js';
import type { ClaudeProjectState } from './loadClaudeProjectsState.js';

/** One unit per project with sessions untouched since the cutoff; always careful. */
export function buildClaudeTranscriptFindings(params: {
  projects: ClaudeProjectState[];
  cutoffMs: number;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const findings = params.projects.flatMap((project) => {
    const old = decideOldTranscriptPaths({ project: project, cutoffMs: params.cutoffMs });
    const foundPaths = toNonEmpty(old.paths);

    if (foundPaths === null) {
      return [];
    }

    return [
      buildClaudeTranscriptFinding({
        project: project,
        cutoffMs: params.cutoffMs,
        sessionCount: old.sessionCount,
        foundPaths: foundPaths,
        processCommands: params.processCommands,
      }),
    ];
  });

  return { findings: findings, isComplete: true };
}

function buildClaudeTranscriptFinding(params: {
  project: ClaudeProjectState;
  cutoffMs: number;
  sessionCount: number;
  foundPaths: ExploreFoundPaths;
  processCommands: string[] | null;
}): ExploreFinding {
  const untouchedSpan = formatDaySpan(CLAUDE_TRANSCRIPT_UNTOUCHED_MS);

  return {
    unit: {
      kind: 'claudeTranscripts',
      projectFolderPath: params.project.path,
      cutoffMs: params.cutoffMs,
      foundPaths: params.foundPaths,
    },
    title: `Old Claude Code conversations of ${params.project.folderName}`,
    explanation: `The saved conversations of a project in Claude Code that nobody continued for ${untouchedSpan}, with their subagent and tool output. The project memory stays.`,
    regeneration: 'Nothing makes them again: a removed conversation can no longer be resumed.',
    risk: 'careful',
    evidenceLines: [
      `${params.sessionCount} conversations of this project are untouched for ${untouchedSpan}.`,
      `Claude Code removes conversations past its cleanupPeriodDays itself, ${untouchedSpan} unless you set more.`,
    ],
    displayPath: params.project.path,
    activity: decideUnitActivity({
      facts: { kind: 'untouchedFiles' },
      processCommands: params.processCommands,
    }),
  };
}
