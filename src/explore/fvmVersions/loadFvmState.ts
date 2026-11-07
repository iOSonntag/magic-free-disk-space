import { basename, dirname } from 'node:path';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreEntryStats,
  loadExploreFolderNames,
  loadExploreRealPath,
} from '../loadExploreRead.js';

/** FVM's cache below the home folder, `~/fvm`, the same on every platform. */
const FVM_CACHE_PATH_NAMES = ['fvm'];

const FVM_VERSIONS_FOLDER_NAME = 'versions';

const FVM_GLOBAL_LINK_NAME = 'default';

// A Flutter SDK; a fork's folder holds version folders instead.
const FLUTTER_SDK_MARKER_NAMES = ['bin', 'flutter'];

export type FvmVersionFolder = { version: string; folderPath: AbsolutePath };

/**
 * The SDK folders of `~/fvm/versions`, and the version the global link `~/fvm/default` points to.
 * `hasUnjudgedFolder` holds when a folder there is no Flutter SDK, such as a fork's.
 */
export type FvmState = {
  versions: FvmVersionFolder[];
  globalVersion: string | null;
  hasUnjudgedFolder: boolean;
};

export async function loadFvmState(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<FvmState, ExploreFileUnreadable>> {
  const cachePath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: FVM_CACHE_PATH_NAMES,
  });
  const versionsPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: cachePath,
    names: [FVM_VERSIONS_FOLDER_NAME],
  });
  const folderNames = await loadExploreFolderNames({
    path: versionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (folderNames.kind === 'failed') {
    return folderNames;
  }

  const globalTarget = await loadExploreRealPath({
    pathRules: params.pathRules,
    path: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: cachePath,
      names: [FVM_GLOBAL_LINK_NAME],
    }),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (globalTarget.kind === 'failed') {
    return globalTarget;
  }

  const versions: FvmVersionFolder[] = [];
  let hasUnjudgedFolder = false;

  for (const version of folderNames.value?.folderNames ?? []) {
    const folderPath = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: versionsPath,
      names: [version],
    });
    const marker = await loadExploreEntryStats({
      path: joinAbsolutePath({
        rules: params.pathRules,
        parentPath: folderPath,
        names: FLUTTER_SDK_MARKER_NAMES,
      }),
      privacyDenialCode: params.privacyDenialCode,
    });

    if (marker.kind === 'failed') {
      return marker;
    }

    if (marker.value === null) {
      hasUnjudgedFolder = true;
      continue;
    }

    versions.push({ version: version, folderPath: folderPath });
  }

  return {
    kind: 'succeeded',
    value: {
      versions: versions,
      globalVersion: decideFvmGlobalVersion({ globalTarget: globalTarget.value }),
      hasUnjudgedFolder: hasUnjudgedFolder,
    },
  };
}

/** The version folder the global link resolves to, by its name; `null` without one. */
function decideFvmGlobalVersion(params: { globalTarget: AbsolutePath | null }): string | null {
  if (params.globalTarget === null) {
    return null;
  }

  if (basename(dirname(params.globalTarget)) !== FVM_VERSIONS_FOLDER_NAME) {
    return null;
  }

  return basename(params.globalTarget);
}
