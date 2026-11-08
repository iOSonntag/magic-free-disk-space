import type { Environment } from '../../environment/buildEnvironment.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitClaudeCodeVersion } from '../exploreUnit.js';
import { compareClaudeCodeVersionUnit } from './compareClaudeCodeVersionUnit.js';
import { loadClaudeCodeVersionState } from './loadClaudeCodeVersionState.js';

/** Reads the versions again and compares them with the unit: still not one Claude Code keeps. */
export async function recheckClaudeCodeVersionUnit(params: {
  unit: ExplorePathUnitClaudeCodeVersion;
  environment: Environment;
  platform: ExploreProbePlatform;
  runningProcesses: RunningProcesses | null;
}): Promise<PathUnitRecheck> {
  const state = await loadClaudeCodeVersionState({
    pathRules: params.environment.pathRules,
    homeDir: params.environment.homeDir,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (state.kind === 'failed') {
    return state;
  }

  return compareClaudeCodeVersionUnit({
    unit: params.unit,
    state: state.value,
    runningProcesses: params.runningProcesses,
  });
}
