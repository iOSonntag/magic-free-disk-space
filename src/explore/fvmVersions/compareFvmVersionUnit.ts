import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitFvmVersion } from '../exploreUnit.js';
import type { ToolPins } from '../projectPins/selectToolPins.js';
import { decideFvmVersionOffers } from './decideFvmVersionOffers.js';
import type { FvmState } from './loadFvmState.js';

/**
 * Unchanged while the fresh state and pins still offer the unit's version at the same folder, and
 * while no process runs from that folder.
 */
export function compareFvmVersionUnit(params: {
  unit: ExplorePathUnitFvmVersion;
  state: FvmState;
  toolPins: ToolPins;
  runningProcesses: RunningProcesses | null;
}): UnitComparison {
  const isStillOffered = decideFvmVersionOffers({
    state: params.state,
    toolPins: params.toolPins,
  }).some(
    (folder) =>
      folder.version === params.unit.version && folder.folderPath === params.unit.folderPath,
  );

  if (!isStillOffered) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'versionFolder', folderPath: params.unit.folderPath },
    runningProcesses: params.runningProcesses,
  });
}
