import type { UnitComparison } from '../decideComparisonActivity.js';
import type { ExplorePathUnitVscodeExtension } from '../exploreUnit.js';
import type { VscodeExtensionState } from './loadVscodeExtensionState.js';

/** Unchanged while the same reason still holds, no registry lists the folder, and VS Code is idle. */
export function compareVscodeExtensionUnit(_params: {
  unit: ExplorePathUnitVscodeExtension;
  state: VscodeExtensionState;
  processCommands: string[] | null;
}): UnitComparison {
  throw new Error('compareVscodeExtensionUnit is not built yet (part 2B3)');
}
