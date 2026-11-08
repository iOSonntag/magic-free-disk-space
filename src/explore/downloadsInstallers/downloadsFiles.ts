import type { Environment } from '../../environment/buildEnvironment.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { Result } from '../../result.js';
import { walkDirectoryTree } from '../../system/walkDirectoryTree.js';
import type { UnitActivityFacts } from '../decideUnitActivity.js';
import type { BrowserFamily, BrowserFamilyBundles } from '../explorePlatform.js';
import { BROWSER_FAMILIES } from '../explorePlatform.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreEntryStats } from '../loadExploreRead.js';

/** An installer, done once its app or update is installed. */
export type DownloadsFileKindInstaller = { kind: 'installer' };

/** A partial download, which only a browser of `browserFamily` writes. */
export type DownloadsFileKindIncomplete = { kind: 'incomplete'; browserFamily: BrowserFamily };

/** What a file in Downloads is, by its name. */
export type DownloadsFileKind = DownloadsFileKindInstaller | DownloadsFileKindIncomplete;

/** Disk images, packages, and archives of an app or a system that install it and are done then. */
const INSTALLER_EXTENSIONS = ['.dmg', '.pkg', '.mpkg', '.xip', '.iso'];

/** The ending of each family's partial download; Safari's `.download` is a folder. */
const INCOMPLETE_EXTENSIONS: Record<BrowserFamily, string> = {
  chromium: '.crdownload',
  firefox: '.part',
  safari: '.download',
};

/** Folders read at once while a folder's newest change is looked for. */
const DOWNLOADS_MAX_CONCURRENT_DIRECTORIES = 4;

/** The kind of the file `name` by its ending, in any case; `null` for every other file. */
export function getDownloadsFileKind(params: { name: string }): DownloadsFileKind | null {
  const lowerCaseName = params.name.toLowerCase();

  if (INSTALLER_EXTENSIONS.some((extension) => lowerCaseName.endsWith(extension))) {
    return { kind: 'installer' };
  }

  const browserFamily = BROWSER_FAMILIES.find((family) =>
    lowerCaseName.endsWith(INCOMPLETE_EXTENSIONS[family]),
  );

  if (browserFamily !== undefined) {
    return { kind: 'incomplete', browserFamily: browserFamily };
  }

  return null;
}

/**
 * The bundles of the browsers of a family: each browser in each app folder, and those the system
 * keeps itself.
 */
function listBrowserBundlePaths(params: {
  environment: Environment;
  bundles: BrowserFamilyBundles;
}): string[] {
  return [
    ...params.environment.applicationDirs.flatMap((applicationDir) =>
      params.bundles.appBundleNames.map((bundleName) =>
        joinAbsolutePath({
          rules: params.environment.pathRules,
          parentPath: applicationDir,
          names: [bundleName],
        }),
      ),
    ),
    ...params.bundles.systemBundlePaths,
  ];
}

/**
 * An installer is judged by its times alone; a partial download while no browser of its family
 * runs, since no other browser writes it.
 */
export function buildDownloadsActivityFacts(params: {
  fileKind: DownloadsFileKind;
  environment: Environment;
  platform: ExploreProbePlatform;
}): UnitActivityFacts {
  switch (params.fileKind.kind) {
    case 'installer':
      return { kind: 'untouchedFiles' };
    case 'incomplete':
      return {
        kind: 'appBundles',
        bundlePaths: listBrowserBundlePaths({
          environment: params.environment,
          bundles: params.platform.explore.browserBundles[params.fileKind.browserFamily],
        }),
      };
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

  let latestModifiedMs = stats.value.modifiedMs;
  let isEveryPartRead = true;

  const walkEnd = await walkDirectoryTree({
    rootPath: params.path,
    isStatsNeeded: true,
    maxConcurrentDirectories: DOWNLOADS_MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => params.deadlineMs !== null && Date.now() >= params.deadlineMs,
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
    // The scan counts the entries its own phases leave unread, never a probe's.
    onEvictedEntrySkipped: null,
  });

  if (!isEveryPartRead || walkEnd === 'stopped') {
    return { kind: 'succeeded', value: { kind: 'unknown' } };
  }

  return { kind: 'succeeded', value: { kind: 'known', modifiedMs: latestModifiedMs } };
}
