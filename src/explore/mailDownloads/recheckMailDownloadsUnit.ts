import type { Environment } from '../../environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitMailDownloads } from '../exploreUnit.js';
import { loadExploreEntryTimes } from '../loadExploreRead.js';
import { isUntouchedMailDownload } from './mailDownloadFiles.js';

/**
 * Reads the unit's files again and compares them with the unit: each still there with the change
 * the scan read and still untouched since Mail saved it, while Mail is not running.
 */
export async function recheckMailDownloadsUnit(params: {
  unit: ExplorePathUnitMailDownloads;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  for (const foundFile of params.unit.foundFiles) {
    const times = await loadExploreEntryTimes({
      path: foundFile.path,
      privacyDenialCode: params.platform.privacyDenialCode,
    });

    if (times.kind === 'failed') {
      return times;
    }

    if (
      times.value === null ||
      times.value.modifiedMs !== foundFile.modifiedMs ||
      !isUntouchedMailDownload({ times: times.value, cutoffMs: params.unit.cutoffMs })
    ) {
      return { kind: 'changed' };
    }
  }

  return decideComparisonActivity({
    facts: { kind: 'appBundles', bundlePaths: params.platform.explore.mailBundlePaths },
    processCommands: params.processCommands,
  });
}
