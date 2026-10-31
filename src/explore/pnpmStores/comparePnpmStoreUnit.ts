import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitPnpmStore } from '../exploreUnit.js';
import { decidePnpmStoreOffers } from './decidePnpmStoreOffers.js';
import type { PnpmInstallState } from './loadPnpmInstallState.js';
import type { PnpmStoreState } from './loadPnpmStoreState.js';
import type { PnpmPins } from './parsePnpmPins.js';

/**
 * Unchanged while the fresh state of the unit's store still offers its folder, and its busy rule
 * sees no pnpm running.
 */
export function comparePnpmStoreUnit(params: {
  unit: ExplorePathUnitPnpmStore;
  storeState: PnpmStoreState;
  installState: PnpmInstallState;
  pins: PnpmPins;
  processCommands: string[] | null;
}): UnitComparison {
  const offers = decidePnpmStoreOffers({
    storeState: params.storeState,
    installState: params.installState,
    pins: params.pins,
  });
  const isStillOffered = offers.offers.some((offer) => offer.folderPath === params.unit.folderPath);

  if (!isStillOffered) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'pnpmStore' },
    processCommands: params.processCommands,
  });
}
