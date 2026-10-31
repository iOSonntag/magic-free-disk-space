import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitAndroidPlatform } from '../exploreUnit.js';
import type { ToolPins } from '../projectPins/selectToolPins.js';
import { decideAndroidPlatformOffers } from './decideAndroidPlatformOffers.js';
import type { AndroidPlatformState } from './loadAndroidPlatformState.js';

/**
 * Unchanged while the fresh state and the unit's pin files read again still offer the platform at
 * the same place, and its busy rule sees it idle.
 */
export function compareAndroidPlatformUnit(params: {
  unit: ExplorePathUnitAndroidPlatform;
  state: AndroidPlatformState;
  toolPins: ToolPins;
  processCommands: string[] | null;
}): UnitComparison {
  const offers = decideAndroidPlatformOffers({ state: params.state, toolPins: params.toolPins });
  const isStillOffered = offers.offers.some(
    (offer) => offer.sdkRoot === params.unit.sdkRoot && offer.folderPath === params.unit.folderPath,
  );

  if (!isStillOffered) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'android' },
    processCommands: params.processCommands,
  });
}
