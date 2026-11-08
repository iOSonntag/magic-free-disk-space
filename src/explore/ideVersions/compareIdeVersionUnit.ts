import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitIdeVersionFolder } from '../exploreUnit.js';
import { hasSamePaths } from '../hasSamePaths.js';
import { buildIdeVersionActivityFacts } from './buildIdeVersionFindings.js';
import { decideIdeVersionOffers } from './decideIdeVersionOffers.js';
import type { IdeVersionFolder } from './loadIdeVersionState.js';
import type { RunningIde } from './loadRunningIdes.js';

/**
 * Unchanged while the folders still offer the unit's folder as an old one with the same paths, and
 * no IDE of its version runs. An unknown activity counts as busy.
 */
export function compareIdeVersionUnit(params: {
  unit: ExplorePathUnitIdeVersionFolder;
  folders: IdeVersionFolder[];
  runningIdes: RunningIde[];
  runningProcesses: RunningProcesses | null;
}): UnitComparison {
  const offer = decideIdeVersionOffers({ folders: params.folders }).find(
    (candidate) =>
      candidate.folderKind === params.unit.folderKind &&
      candidate.folderPath === params.unit.folderPath,
  );

  if (
    offer === undefined ||
    !hasSamePaths({ left: offer.foundPaths, right: params.unit.foundPaths })
  ) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: buildIdeVersionActivityFacts({
      product: params.unit.product,
      version: params.unit.version,
      runningIdes: params.runningIdes,
    }),
    runningProcesses: params.runningProcesses,
  });
}
