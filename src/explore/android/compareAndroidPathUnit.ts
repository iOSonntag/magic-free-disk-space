import type { UnitComparison } from '../decideComparisonActivity.js';
import type {
  ExplorePathUnitAndroidEmulator,
  ExplorePathUnitAndroidSystemImage,
} from '../exploreUnit.js';
import type { AndroidSdkState } from './loadAndroidSdkState.js';

/**
 * Unchanged while the fresh state still offers the unit, no AVD naming the image or no AVD at all,
 * and its busy rule sees it idle.
 */
export function compareAndroidPathUnit(_params: {
  unit: ExplorePathUnitAndroidSystemImage | ExplorePathUnitAndroidEmulator;
  state: AndroidSdkState;
  processCommands: string[] | null;
}): UnitComparison {
  throw new Error('compareAndroidPathUnit is not built yet (part 2A)');
}
