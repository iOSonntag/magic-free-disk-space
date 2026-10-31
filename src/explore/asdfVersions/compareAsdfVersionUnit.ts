import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreToolUnitAsdfVersion } from '../exploreUnit.js';
import type { ToolPins } from '../projectPins/selectToolPins.js';
import { decideAsdfVersionOffers } from './decideAsdfVersionOffers.js';
import type { AsdfState } from './loadAsdfState.js';

/**
 * Unchanged while the fresh state and pins still offer the unit's version at the same path, which
 * needs `legacy_version_file` off, and no process runs from its folder.
 */
export function compareAsdfVersionUnit(params: {
  unit: ExploreToolUnitAsdfVersion;
  state: AsdfState;
  toolPins: ToolPins;
  processCommands: string[] | null;
}): UnitComparison {
  const offers = decideAsdfVersionOffers({ state: params.state, toolPins: params.toolPins });
  const isStillOffered = offers.offers.some(
    (offer) =>
      offer.folderPath === params.unit.installPath &&
      offer.asdfToolName === params.unit.asdfToolName &&
      offer.version === params.unit.version,
  );

  if (!isStillOffered) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'versionFolder', folderPath: params.unit.installPath },
    processCommands: params.processCommands,
  });
}
