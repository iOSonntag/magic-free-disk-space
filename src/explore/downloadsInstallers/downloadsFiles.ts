import type { Environment } from '../../environment/buildEnvironment.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { Result } from '../../result.js';
import { walkDirectoryTree } from '../../system/walkDirectoryTree.js';
import type { UnitActivityFacts } from '../decideUnitActivity.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreEntryStats } from '../loadExploreRead.js';

/** What a file in Downloads is, by its name; `null` for every other file. */
export type DownloadsFileKind = 'installer' | 'incomplete';

/** Disk images, packages, and archives of an app or a system that install it and are done then. */
const INSTALLER_EXTENSIONS = ['.dmg', '.pkg', '.mpkg', '.xip', '.iso'];

/** Safari's `.download` folder, Chrome's and its kin's `.crdownload`, Firefox's `.part`. */
const INCOMPLETE_EXTENSIONS = ['.download', '.crdownload', '.part'];

/** Folders read at once while a folder's newest change is looked for. */
const DOWNLOADS_MAX_CONCURRENT_DIRECTORIES = 4;

export function getDownloadsFileKind(params: { name: string }): DownloadsFileKind | null {
  const lowerCaseName = params.name.toLowerCase();

  if (INSTALLER_EXTENSIONS.some((extension) => lowerCaseName.endsWith(extension))) {
    return 'installer';
  }

  if (INCOMPLETE_EXTENSIONS.some((extension) => lowerCaseName.endsWith(extension))) {
    return 'incomplete';
  }

  return null;
}

/**
 * The bundles of the browsers that write a partial download: each browser in each app folder, and
 * the browsers the system keeps itself.
 */
export function listBrowserBundlePaths(params: {
  environment: Environment;
  platform: ExploreProbePlatform;
}): string[] {
  const browsers = params.platform.explore.browserBundles;

  return [
    ...params.environment.applicationDirs.flatMap((applicationDir) =>
      browsers.appBundleNames.map((bundleName) =>
        joinAbsolutePath({
          rules: params.environment.pathRules,
          parentPath: applicationDir,
          names: [bundleName],
        }),
      ),
    ),
    ...browsers.systemBundlePaths,
  ];
}

/** An installer is judged by its times alone; a partial download while no browser writes it. */
export function buildDownloadsActivityFacts(params: {
  kind: DownloadsFileKind;
  environment: Environment;
  platform: ExploreProbePlatform;
}): UnitActivityFacts {
  switch (params.kind) {
    case 'installer':
      return { kind: 'untouchedFiles' };
    case 'incomplete':
      return { kind: 'appBundles', bundlePaths: listBrowserBundlePaths(params) };
  }
}

export type LatestModifiedKnown = { kind: 'known'; modifiedMs: number };

/** A part of the folder could not be read, or the deadline stopped its walk. */
export type LatestModifiedUnknown = { kind: 'unknown' };

/** The newest change of an entry, or that it is not known. */
export type LatestModified = LatestModifiedKnown | LatestModifiedUnknown;

/**
 * The newest change of the entry: a file's own, or for a folder, such as Safari's `.download`,
 * the newest of itself and everything in it, read until `deadlineMs`, or to its end without one.
 * `null` when nothing is there.
 */
export async function loadLatestModified(params: {
  path: string;
  platform: ExploreProbePlatform;
  deadlineMs: number | null;
}): Promise<Result<LatestModified | null, ExploreFileUnreadable>> {
  const stats = await loadExploreEntryStats({
    path: params.path,
    privacyDenialCode: params.platform.privacyDenialCode,
  });

  if (stats.kind === 'failed') {
    return stats;
  }

  if (stats.value === null) {
    return { kind: 'succeeded', value: null };
  }

  if (stats.value.kind !== 'directory') {
    return { kind: 'succeeded', value: { kind: 'known', modifiedMs: stats.value.modifiedMs } };
  }

  const deadlineMs = params.deadlineMs;
  let latestModifiedMs = stats.value.modifiedMs;
  let isEveryPartRead = true;

  const walkEnd = await walkDirectoryTree({
    rootPath: params.path,
    isStatsNeeded: true,
    maxConcurrentDirectories: DOWNLOADS_MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => deadlineMs !== null && Date.now() >= deadlineMs,
    entryReads: params.platform.entryReads,
    visitEntry: (entry) => {
      if (entry.stats !== null) {
        latestModifiedMs = Math.max(latestModifiedMs, entry.stats.modifiedMs);
      }

      return 'descend';
    },
    onUnreadable: () => {
      isEveryPartRead = false;
    },
    onEvictedEntrySkipped: () => {},
  });

  if (!isEveryPartRead || walkEnd === 'stopped') {
    return { kind: 'succeeded', value: { kind: 'unknown' } };
  }

  return { kind: 'succeeded', value: { kind: 'known', modifiedMs: latestModifiedMs } };
}
