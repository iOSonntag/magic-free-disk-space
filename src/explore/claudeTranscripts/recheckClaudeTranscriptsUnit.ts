import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitClaudeTranscripts } from '../exploreUnit.js';
import { compareClaudeTranscriptsUnit } from './compareClaudeTranscriptsUnit.js';
import { loadClaudeProjectState } from './loadClaudeProjectsState.js';

/** Reads the project folder again and compares its old transcripts with the unit. */
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

  return compareClaudeTranscriptsUnit({
    unit: params.unit,
    project: project.value,
    processCommands: params.processCommands,
  });
}
