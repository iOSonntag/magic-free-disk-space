import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type {
  ExplorePathUnitAndroidEmulator,
  ExplorePathUnitAndroidSystemImage,
} from '../exploreUnit.js';
import type { AndroidPackageOffers } from './decideAndroidPackageOffers.js';
import {
  decideAndroidEmulatorOffers,
  decideAndroidSystemImageOffers,
} from './decideAndroidPackageOffers.js';
import type { AndroidSdkState } from './loadAndroidSdkState.js';

/**
 * Unchanged while the fresh state still offers the unit, no AVD naming the image or no AVD at all,
 * and its busy rule sees it idle.
 */
export function compareAndroidPathUnit(params: {
  unit: ExplorePathUnitAndroidSystemImage | ExplorePathUnitAndroidEmulator;
  state: AndroidSdkState;
  processCommands: string[] | null;
}): UnitComparison {
  const offers = decideAndroidPathUnitOffers({ unit: params.unit, state: params.state });
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

function decideAndroidPathUnitOffers(params: {
  unit: ExplorePathUnitAndroidSystemImage | ExplorePathUnitAndroidEmulator;
  state: AndroidSdkState;
}): AndroidPackageOffers {
  switch (params.unit.kind) {
    case 'androidSystemImage':
      return decideAndroidSystemImageOffers(params.state);
    case 'androidEmulator':
      return decideAndroidEmulatorOffers(params.state);
  }
}
