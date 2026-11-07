import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import { walkDirectoryTree } from '../../system/walkDirectoryTree.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ExploreFoundFile } from '../exploreUnit.js';
import { loadExploreEntryStats, loadExploreEntryTimes } from '../loadExploreRead.js';
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
  const rootNames = run.platform.explore.mailDownloadsRoot;

  if (rootNames === null) {
    return { kind: 'failed', failure: { reason: 'placeMissing' } };
  }

  const folderPath = joinAbsolutePath({
    rules: run.environment.pathRules,
    parentPath: run.environment.homeDir,
    names: rootNames,
  });
  const folderStats = await loadExploreEntryStats({
    path: folderPath,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  if (folderStats.kind === 'failed') {
    return folderStats;
  }

  if (folderStats.value === null || folderStats.value.kind !== 'directory') {
    return { kind: 'failed', failure: { reason: 'placeMissing' } };
  }

  const filePaths: string[] = [];
  let isComplete = true;
  const walkEnd = await walkDirectoryTree({
    rootPath: folderPath,
    isStatsNeeded: false,
    maxConcurrentDirectories: MAIL_MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => Date.now() >= run.deadlineMs,
    entryReads: run.platform.entryReads,
    visitEntry: (entry) => {
      if (entry.name.startsWith('.')) {
        return 'skip';
      }

      if (entry.kind === 'file') {
        filePaths.push(entry.path);
      }

      return 'descend';
    },
    onUnreadable: () => {
      isComplete = false;
    },
    onEvictedEntrySkipped: () => {},
  });
  const foundFiles: ExploreFoundFile[] = [];

  for (const filePath of filePaths.sort()) {
    const times = await loadExploreEntryTimes({
      path: filePath,
      privacyDenialCode: run.platform.privacyDenialCode,
    });

    if (times.kind === 'failed') {
      isComplete = false;

      continue;
    }

    if (
      times.value !== null &&
      isUntouchedMailDownload({ times: times.value, cutoffMs: run.staleCutoffMs })
    ) {
      foundFiles.push({
        path: parseWalkedPath({ run: run, text: filePath }),
        modifiedMs: times.value.modifiedMs,
      });
    }
  }

  isComplete = isComplete && walkEnd === 'completed';

  const [firstFile, ...restFiles] = foundFiles;

  if (firstFile === undefined) {
    return { kind: 'succeeded', value: { findings: [], isComplete: isComplete } };
  }

  const staleDate = new Date(run.staleCutoffMs).toISOString().slice(0, 10);
  const countText = foundFiles.length === 1 ? '1 attachment' : `${foundFiles.length} attachments`;

  return {
    kind: 'succeeded',
    value: {
      findings: [
        {
          unit: {
            kind: 'mailDownloads',
            folderPath: folderPath,
            cutoffMs: run.staleCutoffMs,
            foundFiles: [firstFile, ...restFiles],
          },
          title: 'Attachments Mail opened',
          explanation:
            'Copies of attachments Mail saved when you opened them, unchanged since and not opened for the stale period. The messages keep their attachments.',
          regeneration: 'Mail saves a copy again when you open the attachment.',
          risk: 'review',
          evidenceLines: [`${countText} saved and last read before ${staleDate}, never changed.`],
          displayPath: folderPath,
          activity: decideUnitActivity({
            facts: { kind: 'appBundles', bundlePaths: run.platform.explore.mailBundlePaths },
            processCommands: run.processCommands,
          }),
        },
      ],
      isComplete: isComplete,
    },
  };
}

/** A path the walk joined below an absolute root; throws for one that is not absolute, a bug. */
function parseWalkedPath(params: { run: ExploreProbeRun; text: string }): AbsolutePath {
  const path = parseAbsolutePath({ rules: params.run.environment.pathRules, text: params.text });

  if (path.kind === 'failed') {
    throw new Error('The walk of Mail Downloads joined a path that is not absolute.');
  }

  return path.value;
}
