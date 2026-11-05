import type { Environment } from '../../environment/buildEnvironment.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { PathUnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExplorePathUnitMailDownloads } from '../exploreUnit.js';
import { loadExploreEntryStats } from '../loadExploreRead.js';
import { isUntouchedMailDownload } from './mailDownloadFiles.js';

/**
 * Reads the unit's files again and compares them with the unit: each still there with the change
 * the scan read and still untouched since Mail saved it, while Mail is not running.
 */
export async function recheckMailDownloadsUnit(params: {
  unit: ExplorePathUnitMailDownloads;
  environment: Environment;
  platform: ExploreProbePlatform;
  runningProcesses: RunningProcesses | null;
}): Promise<PathUnitRecheck> {
  for (const foundFile of params.unit.foundFiles) {
    const stats = await loadExploreEntryStats({
      path: foundFile.path,
      privacyDenialCode: params.platform.privacyDenialCode,
    });

    if (stats.kind === 'failed') {
      return stats;
    }

    if (
      stats.value === null ||
      stats.value.modifiedMs !== foundFile.modifiedMs ||
      !isUntouchedMailDownload({ stats: stats.value, cutoffMs: params.unit.cutoffMs })
    ) {
      return { kind: 'changed' };
    }
  }

  return decideComparisonActivity({
    facts: { kind: 'appBundles', bundlePaths: params.platform.explore.mailBundlePaths },
    runningProcesses: params.runningProcesses,
  });
}
