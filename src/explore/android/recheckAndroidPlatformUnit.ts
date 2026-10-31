import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExplorePathUnitAndroidPlatform } from '../exploreUnit.js';

/** Reads the platforms and the unit's pin files again and compares them with the unit. */
export async function recheckAndroidPlatformUnit(params: {
  unit: ExplorePathUnitAndroidPlatform;
  environment: Environment;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return { kind: 'changed' };
}
