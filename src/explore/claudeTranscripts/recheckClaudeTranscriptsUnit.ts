import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitClaudeTranscripts } from '../exploreUnit.js';
import { hasSamePaths } from '../hasSamePaths.js';
import { decideOldTranscriptPaths } from './decideOldTranscriptPaths.js';
import { loadClaudeProjectState } from './loadClaudeProjectsState.js';

/**
 * Reads the project folder again and compares its transcripts older than the scan's cutoff with
 * the unit, so a conversation resumed since, or a new one, changes it.
 */
export async function recheckClaudeTranscriptsUnit(params: {
  unit: ExplorePathUnitClaudeTranscripts;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  const project = await loadClaudeProjectState({
    pathRules: params.environment.pathRules,
    projectFolderPath: params.unit.projectFolderPath,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (project.kind === 'failed') {
    return project;
  }

  if (
    project.value === null ||
    !hasSamePaths({
      left: decideOldTranscriptPaths({ project: project.value, cutoffMs: params.unit.cutoffMs })
        .paths,
      right: params.unit.foundPaths,
    })
  ) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'untouchedFiles' },
    processCommands: params.processCommands,
  });
}
