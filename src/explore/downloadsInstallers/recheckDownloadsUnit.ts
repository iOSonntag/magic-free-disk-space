import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type {
  ExplorePathUnitDownloadsIncomplete,
  ExplorePathUnitDownloadsInstallers,
} from '../exploreUnit.js';
import { buildDownloadsActivityFacts, loadLatestModified } from './downloadsFiles.js';

/**
 * Reads the unit's files again and compares them with the unit: each still there with the newest
 * change the scan read, and for partial downloads no browser that writes one running.
 */
export async function recheckDownloadsUnit(params: {
  unit: ExplorePathUnitDownloadsInstallers | ExplorePathUnitDownloadsIncomplete;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  for (const foundFile of params.unit.foundFiles) {
    const latest = await loadLatestModified({
      path: foundFile.path,
      platform: params.platform,
      deadlineMs: null,
    });

    if (latest.kind === 'failed') {
      return latest;
    }

    if (latest.value?.kind !== 'known' || latest.value.modifiedMs !== foundFile.modifiedMs) {
      return { kind: 'changed' };
    }
  }

  return decideComparisonActivity({
    facts: buildDownloadsActivityFacts({
      kind: params.unit.kind === 'downloadsInstallers' ? 'installer' : 'incomplete',
      environment: params.environment,
      platform: params.platform,
    }),
    processCommands: params.processCommands,
  });
}
