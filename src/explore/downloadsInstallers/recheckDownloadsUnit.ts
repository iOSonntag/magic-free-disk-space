import type { Environment } from '../../environment/buildEnvironment.js';
import { throwPartNotBuilt } from '../../notBuilt.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type {
  ExplorePathUnitDownloadsIncomplete,
  ExplorePathUnitDownloadsInstallers,
} from '../exploreUnit.js';

/**
 * Reads the unit's files again and compares them with the unit: each still unchanged since its
 * cutoff, and no browser that writes a partial download running.
 */
export function recheckDownloadsUnit(_params: {
  unit: ExplorePathUnitDownloadsInstallers | ExplorePathUnitDownloadsIncomplete;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return throwPartNotBuilt();
}
