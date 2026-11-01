import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitNvmVersion } from '../exploreUnit.js';
import type { ToolPins } from '../projectPins/selectToolPins.js';
import { decideNvmVersionOffers } from './decideNvmVersionOffers.js';
import type { NvmState } from './loadNvmState.js';

/**
 * Unchanged while the fresh state and pins still offer the unit's folder and its busy rule sees it
 * idle.
 */
export function compareNvmVersionUnit(params: {
  unit: ExplorePathUnitNvmVersion;
  state: NvmState;
  toolPins: ToolPins;
  processCommands: string[] | null;
}): UnitComparison {
  const offers = decideNvmVersionOffers({ state: params.state, toolPins: params.toolPins });
  const isStillOffered = offers.offers.some(
    (offer) => offer.folderPath === params.unit.folderPath && offer.version === params.unit.version,
  );

  if (!isStillOffered) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'versionFolder', folderPath: params.unit.folderPath },
    processCommands: params.processCommands,
  });
}
