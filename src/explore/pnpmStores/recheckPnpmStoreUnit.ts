import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import type { ExplorePathUnitPnpmStore } from '../exploreUnit.js';

/** Answers changed, so a pnpm store unit is never removed. */
export async function recheckPnpmStoreUnit(params: {
  unit: ExplorePathUnitPnpmStore;
  environment: Environment;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  return { kind: 'changed' };
}
