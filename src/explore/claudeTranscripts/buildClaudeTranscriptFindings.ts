import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreFoundPaths, ExploreProbeFindings } from '../exploreUnit.js';
import { decideOldTranscriptPaths } from './decideOldTranscriptPaths.js';
import type { ClaudeProjectState } from './loadClaudeProjectsState.js';

/** One unit per project with sessions untouched since the cutoff; always careful. */
export function buildClaudeTranscriptFindings(params: {
  projects: ClaudeProjectState[];
  cutoffMs: number;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const findings = params.projects.flatMap((project) => {
    const old = decideOldTranscriptPaths({ project: project, cutoffMs: params.cutoffMs });
    const [firstPath, ...otherPaths] = old.paths;

    if (firstPath === undefined) {
      return [];
    }

    return [
      buildClaudeTranscriptFinding({
        project: project,
        cutoffMs: params.cutoffMs,
        sessionCount: old.sessionCount,
        foundPaths: [firstPath, ...otherPaths],
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
  return {
    unit: {
      kind: 'claudeTranscripts',
      projectFolderPath: params.project.path,
      cutoffMs: params.cutoffMs,
      foundPaths: params.foundPaths,
    },
    title: `Old Claude Code conversations of ${params.project.folderName}`,
    explanation:
      'The saved conversations of a project in Claude Code that nobody continued for 30 days, with their subagent and tool output. The project memory stays.',
    regeneration: 'Nothing makes them again: a removed conversation can no longer be resumed.',
    risk: 'careful',
    evidenceLines: [
      `${params.sessionCount} conversations of this project are untouched for 30 days.`,
      'Claude Code removes conversations past its cleanupPeriodDays itself, 30 days unless you set more.',
    ],
    displayPath: params.project.path,
    activity: decideUnitActivity({
      facts: { kind: 'untouchedFiles' },
      processCommands: params.processCommands,
    }),
  };
}
