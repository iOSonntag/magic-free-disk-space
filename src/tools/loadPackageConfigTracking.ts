import { dirname, join, relative, sep } from 'node:path';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import { loadFileBytes } from '../system/loadFileBytes.js';
import type { FileKind } from '../system/loadFileIdentity.js';
import { loadFileText } from '../system/loadFileText.js';
import type { PackageConfigTracking } from './decidePackageConfigTracking.js';
import {
  decidePackageConfigTracking,
  PACKAGE_CONFIG_FILE_NAME,
} from './decidePackageConfigTracking.js';
import { parseGitDirFilePath } from './parseGitDirFilePath.js';

const GIT_INDEX_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Markers of a version control that keeps one in every folder whose files it tracks, so it can
 * track `.dart_tool/package_config.json` only with the marker in `.dart_tool` itself.
 */
const dartToolFolderMarkerNames = ['CVS'];

/**
 * Markers of the working-copy root of a version control other than git, which can restore a tracked
 * file as git can from any folder above it, so each folder up to `/` is checked.
 */
const walkedFolderMarkerNames = [
  '.jj',
  '.hg',
  '.sl',
  '.svn',
  '.bzr',
  '_darcs',
  '.pijul',
  '.fslckout',
  '_FOSSIL_',
];

/**
 * Whether version control tracks the `package_config.json` of `dartToolRealPath`. It walks
 * `.dart_tool` and each folder above it up to `/`: a marker of `dartToolFolderMarkerNames` in
 * `.dart_tool`, or of `walkedFolderMarkerNames` in any walked folder, counts by its exact name, and
 * any marker answers `unknown`. Else the nearest `.git`, a folder or a `gitdir:` file, names the git
 * dir, whose `index` of at most 64 MiB decides by the config's path relative to the folder of that
 * `.git`. Every case this rule cannot judge, a failed read, an index `parseGitIndexPaths` cannot
 * read, or no repository included, answers `unknown`.
 */
export async function loadPackageConfigTracking(params: {
  dartToolRealPath: string;
}): Promise<PackageConfigTracking> {
  const folders = buildFolderPathsUpToRoot(params.dartToolRealPath);
  const dartToolMarked = await hasVersionControlMarker({
    folder: params.dartToolRealPath,
    markerNames: dartToolFolderMarkerNames,
  });

  if (dartToolMarked) {
    return 'unknown';
  }

  for (const folder of folders) {
    const folderMarked = await hasVersionControlMarker({
      folder: folder,
      markerNames: walkedFolderMarkerNames,
    });

    if (folderMarked) {
      return 'unknown';
    }
  }

  const gitDir = await findGitDir({ folders: folders });

  switch (gitDir.kind) {
    case 'none':
    case 'unreadable':
      return 'unknown';
    case 'found':
      return await loadGitDirPackageConfigTracking({
        gitDir: gitDir.path,
        workTreePath: gitDir.workTreePath,
        dartToolRealPath: params.dartToolRealPath,
      });
  }
}

/** `folder` and each folder above it, nearest first, up to `/`. */
function buildFolderPathsUpToRoot(folder: string): string[] {
  const parentFolder = dirname(folder);

  if (parentFolder === folder) {
    return [folder];
  }

  return [folder, ...buildFolderPathsUpToRoot(parentFolder)];
}

/**
 * Whether `folder` holds an entry named exactly one of `markerNames`; `true` too when an lstat
 * fails for a reason other than a missing entry, or the listing of `folder` fails.
 */
async function hasVersionControlMarker(params: {
  folder: string;
  markerNames: string[];
}): Promise<boolean> {
  for (const markerName of params.markerNames) {
    const markerStats = await loadEntryStats({ path: join(params.folder, markerName) });

    if (markerStats.kind === 'failed') {
      if (markerStats.failure.reason !== 'missing') {
        return true;
      }

      continue;
    }

    // A volume that ignores case answers the lstat for a variant too, such as `CVs` for `CVS`.
    const folderNames = await loadDirectoryNames({ path: params.folder });

    if (folderNames.kind === 'failed' || folderNames.value.includes(markerName)) {
      return true;
    }
  }

  return false;
}

/**
 * Whether the `index` of `gitDir` names the `package_config.json` of `dartToolRealPath` by its
 * path relative to `workTreePath`; `unknown` for an index it cannot read.
 */
async function loadGitDirPackageConfigTracking(params: {
  gitDir: string;
  workTreePath: string;
  dartToolRealPath: string;
}): Promise<PackageConfigTracking> {
  const indexBytes = await loadFileBytes({
    path: join(params.gitDir, 'index'),
    maxBytes: GIT_INDEX_MAX_BYTES,
  });

  if (indexBytes === null) {
    return 'unknown';
  }

  const packageConfigPath = relative(
    params.workTreePath,
    join(params.dartToolRealPath, PACKAGE_CONFIG_FILE_NAME),
  )
    .split(sep)
    .join('/');

  return decidePackageConfigTracking({
    indexBytes: indexBytes,
    packageConfigPath: packageConfigPath,
  });
}

/** `workTreePath` is the folder that holds the `.git` entry that names the git dir `path`. */
type GitDirLookupFound = { kind: 'found'; path: string; workTreePath: string };

/** No folder of the walk holds a `.git` entry. */
type GitDirLookupNone = { kind: 'none' };

/** The nearest `.git` names no git dir this rule can read, or an lstat of the walk failed. */
type GitDirLookupUnreadable = { kind: 'unreadable' };

/** The git dir of the repository that holds a folder, as git finds it walking up from it. */
type GitDirLookup = GitDirLookupFound | GitDirLookupNone | GitDirLookupUnreadable;

/**
 * The git dir that the nearest `.git` in `folders`, nearest first, names: a directory, or a file
 * whose first line is `gitdir: <path>`. `unreadable` for any other `.git` or a failed read.
 */
async function findGitDir(params: { folders: string[] }): Promise<GitDirLookup> {
  for (const folder of params.folders) {
    const gitPath = join(folder, '.git');
    const gitEntryStats = await loadEntryStats({ path: gitPath });

    if (gitEntryStats.kind === 'succeeded') {
      return await loadGitDirOfEntry({
        folder: folder,
        gitPath: gitPath,
        kind: gitEntryStats.value.kind,
      });
    }

    if (gitEntryStats.failure.reason !== 'missing') {
      return { kind: 'unreadable' };
    }
  }

  return { kind: 'none' };
}

async function loadGitDirOfEntry(params: {
  folder: string;
  gitPath: string;
  kind: FileKind;
}): Promise<GitDirLookup> {
  switch (params.kind) {
    case 'directory':
      return { kind: 'found', path: params.gitPath, workTreePath: params.folder };
    case 'file': {
      const gitFileText = await loadFileText({ path: params.gitPath });

      if (gitFileText === null) {
        return { kind: 'unreadable' };
      }

      const gitDir = parseGitDirFilePath({ text: gitFileText, folder: params.folder });

      if (gitDir === null) {
        return { kind: 'unreadable' };
      }

      return { kind: 'found', path: gitDir, workTreePath: params.folder };
    }
    case 'symbolicLink':
    case 'other':
      return { kind: 'unreadable' };
  }
}
