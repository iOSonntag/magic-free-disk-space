import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExplorePathUnitNvmVersion } from '../exploreUnit.js';

/** Answers changed, so an nvm version unit is never removed. */
export async function recheckNvmVersionUnit(params: {
  unit: ExplorePathUnitNvmVersion;
  environment: Environment;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return { kind: 'changed' };
}
