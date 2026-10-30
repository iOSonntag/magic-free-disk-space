import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitVscodeExtension } from '../exploreUnit.js';
import { findVscodeExtensionOffer } from './buildVscodeExtensionFindings.js';
import type { VscodeExtensionState } from './loadVscodeExtensionState.js';

/** Unchanged while the same reason still holds, no registry lists the folder, and VS Code is idle. */
export function compareVscodeExtensionUnit(params: {
  unit: ExplorePathUnitVscodeExtension;
  state: VscodeExtensionState;
  processCommands: string[] | null;
}): UnitComparison {
  switch (params.state.kind) {
    case 'noExtensions':
      return { kind: 'changed' };
    case 'installed': {
      const folder = params.state.folders.find(
        (installed) => installed.path === params.unit.folderPath,
      );

      if (
        folder === undefined ||
        findVscodeExtensionOffer({
          state: params.state,
          folder: folder,
          reason: params.unit.reason,
        }) === null
      ) {
        return { kind: 'changed' };
      }

      return decideComparisonActivity({
        facts: { kind: 'vscodeExtension' },
        processCommands: params.processCommands,
      });
    }
  }
}
