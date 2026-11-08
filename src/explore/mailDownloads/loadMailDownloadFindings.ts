import { resolveCatalogLocation } from '../../catalog/resolveCatalogLocation.js';
import { toNonEmpty } from '../../system/nonEmptyList.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import { formatCountText, formatIsoDay } from '../formatLimitTexts.js';
import { loadExploreEntryStats } from '../loadExploreRead.js';
import { loadWalkedFiles } from '../loadWalkedFiles.js';
import { isUntouchedMailDownload } from './mailDownloadFiles.js';

/** Folders read at once, one per message Mail saved attachments of. */
const MAIL_MAX_CONCURRENT_DIRECTORIES = 4;

/**
 * Finds the attachment copies Mail saved that nobody changed since, saved and read before the
 * stale cutoff, as one unit of files; the folders of the messages stay. `placeMissing` where the
 * platform has no such folder or Mail never saved one.
 */
export async function loadMailDownloadFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  if (run.platform.explore.mailDownloadsRoot === null) {
    return { kind: 'failed', failure: { reason: 'placeMissing' } };
  }

  const folderPath = resolveCatalogLocation({
    environment: run.environment,
    location: run.platform.explore.mailDownloadsRoot,
  });
  const folderStats = await loadExploreEntryStats({
    path: folderPath,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  if (folderStats.kind === 'failed') {
    return folderStats;
  }

  if (folderStats.value?.kind !== 'directory') {
    return { kind: 'failed', failure: { reason: 'placeMissing' } };
  }

  const walked = await loadWalkedFiles({
    run: run,
    rootPath: folderPath,
    isDescending: true,
    maxFiles: null,
    maxConcurrentDirectories: MAIL_MAX_CONCURRENT_DIRECTORIES,
    isKept: (stats) => isUntouchedMailDownload({ stats: stats, cutoffMs: run.staleCutoffMs }),
  });
  const foundFiles = toNonEmpty(
    walked.files.map((file) => ({ path: file.path, modifiedMs: file.stats.modifiedMs })),
  );

  if (foundFiles === null) {
    return { kind: 'succeeded', value: { findings: [], isComplete: walked.isComplete } };
  }

  const countText = formatCountText({ count: foundFiles.length, noun: 'attachment' });

  return {
    kind: 'succeeded',
    value: {
      findings: [
        {
          unit: {
            kind: 'mailDownloads',
            folderPath: folderPath,
            cutoffMs: run.staleCutoffMs,
            foundFiles: foundFiles,
          },
          title: 'Attachments Mail opened',
          explanation:
            'Copies of attachments Mail saved when you opened them, unchanged since and not opened for the stale period. The messages keep their attachments.',
          regeneration: 'Mail saves a copy again when you open the attachment.',
          risk: 'review',
          evidenceLines: [
            `${countText} saved and last read before ${formatIsoDay(run.staleCutoffMs)}, never changed.`,
          ],
          displayPath: folderPath,
          activity: decideUnitActivity({
            facts: { kind: 'appBundles', bundlePaths: run.platform.explore.mailBundlePaths },
            runningProcesses: run.runningProcesses,
          }),
        },
      ],
      isComplete: walked.isComplete,
    },
  };
}
