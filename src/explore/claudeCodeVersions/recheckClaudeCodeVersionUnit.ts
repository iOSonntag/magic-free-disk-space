import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck, UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitClaudeCodeVersion } from '../exploreUnit.js';
import { decideClaudeCodeVersionOffers } from './decideClaudeCodeVersionOffers.js';
import type { ClaudeCodeVersionState } from './loadClaudeCodeVersionState.js';
import { loadClaudeCodeVersionState } from './loadClaudeCodeVersionState.js';

/** Reads the versions again and compares them with the unit: still not one Claude Code keeps. */
export async function recheckClaudeCodeVersionUnit(params: {
  unit: ExplorePathUnitClaudeCodeVersion;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
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
    processCommands: params.processCommands,
  });
}

/** Unchanged while the version is still offered at its path, and no `claude` runs. */
export function compareClaudeCodeVersionUnit(params: {
  unit: ExplorePathUnitClaudeCodeVersion;
  state: ClaudeCodeVersionState;
  processCommands: string[] | null;
}): UnitComparison {
  switch (params.state.kind) {
    case 'noVersions':
      return { kind: 'changed' };
    case 'installed': {
      const isOffered = (decideClaudeCodeVersionOffers({ state: params.state }) ?? []).some(
        (entry) => entry.path === params.unit.folderPath,
      );

      if (!isOffered) {
        return { kind: 'changed' };
      }

      return decideComparisonActivity({
        facts: { kind: 'claudeCodeVersion', versionPath: params.unit.folderPath },
        processCommands: params.processCommands,
      });
    }
  }
}
