import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitClaudeCodeVersion } from '../exploreUnit.js';
import { decideClaudeCodeVersionOffers } from './decideClaudeCodeVersionOffers.js';
import type { ClaudeCodeVersionState } from './loadClaudeCodeVersionState.js';

/** Unchanged while the version is still offered at its path, and no `claude` runs. */
export function compareClaudeCodeVersionUnit(params: {
  unit: ExplorePathUnitClaudeCodeVersion;
  state: ClaudeCodeVersionState;
  runningProcesses: RunningProcesses | null;
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
        runningProcesses: params.runningProcesses,
      });
    }
  }
}
