import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitIdeVersionFolder } from '../exploreUnit.js';
import { hasSamePaths } from '../hasSamePaths.js';
import { buildIdeVersionActivityFacts } from './buildIdeVersionFindings.js';
import { decideIdeVersionOffers } from './decideIdeVersionOffers.js';
import { loadIdeVersionState } from './loadIdeVersionState.js';
import { loadRunningIdes } from './loadRunningIdes.js';

/**
 * Reads the product's version folders again and compares them with the unit: still an old one with
 * the same paths, while no IDE of its version runs. An unknown activity counts as busy.
 */
export async function recheckIdeVersionUnit(params: {
  unit: ExplorePathUnitIdeVersionFolder;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  const folders = await loadIdeVersionState({
    pathRules: params.environment.pathRules,
    homeDir: params.environment.homeDir,
    roots: params.platform.explore.ideVersionRoots,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (folders.kind === 'failed') {
    return folders;
  }

  const offer = decideIdeVersionOffers({ folders: folders.value }).find(
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

  const runningIdes = await loadRunningIdes({
    processCommands: params.processCommands,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  return decideComparisonActivity({
    facts: buildIdeVersionActivityFacts({
      product: params.unit.product,
      version: params.unit.version,
      runningIdes: runningIdes,
    }),
    processCommands: params.processCommands,
  });
}
