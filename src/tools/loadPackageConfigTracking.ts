import { dirname, join } from 'node:path';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import type { EntryStatsResult } from '../system/loadEntryStats.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import { loadFileBytes } from '../system/loadFileBytes.js';
import type { FileKind } from '../system/loadFileIdentity.js';
import { loadFileText } from '../system/loadFileText.js';
import type { PackageConfigTracking } from './decidePackageConfigTracking.js';
import {
  decidePackageConfigTracking,
  findPackageConfigCandidatePaths,
  PACKAGE_CONFIG_FILE_NAME,
} from './decidePackageConfigTracking.js';
import { parseGitDirFilePath } from './parseGitDirFilePath.js';
import { parseGitIndexPaths } from './parseGitIndexPaths.js';

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
 * dir, whose `index` of at most 64 MiB decides: the volume tells whether an entry that
 * `findPackageConfigCandidatePaths` finds, joined to the folder of that `.git`, is the config.
 * Every case this rule cannot judge, a failed read, an index `parseGitIndexPaths` cannot read, or
 * no repository included, answers `unknown`.
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

  if (gitDir === null) {
    return 'unknown';
  }

  return await loadGitDirPackageConfigTracking({
    gitDir: gitDir.path,
    workTreePath: gitDir.workTreePath,
    dartToolRealPath: params.dartToolRealPath,
  });
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
 * Whether an entry of the `index` of `gitDir`, joined to `workTreePath`, is the same file as the
 * `package_config.json` of `dartToolRealPath`; `unknown` for an index it cannot read.
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

  const indexPaths = parseGitIndexPaths(indexBytes);

  if (indexPaths === null) {
    return 'unknown';
  }

  const candidatePaths = findPackageConfigCandidatePaths({ indexPaths: indexPaths });

  if (candidatePaths === null) {
    return 'unknown';
  }

  const packageConfigStats = await loadEntryStats({
    path: join(params.dartToolRealPath, PACKAGE_CONFIG_FILE_NAME),
  });
  const candidateStats = await loadCandidateStats({
    workTreePath: params.workTreePath,
    candidatePaths: candidatePaths,
  });

  return decidePackageConfigTracking({
    packageConfigStats: packageConfigStats,
    candidateStats: candidateStats,
  });
}

/** The stats of each of `candidatePaths`, joined to `workTreePath`, in their order. */
async function loadCandidateStats(params: {
  workTreePath: string;
  candidatePaths: string[];
}): Promise<EntryStatsResult[]> {
  const candidateStats: EntryStatsResult[] = [];

  for (const candidatePath of params.candidatePaths) {
    candidateStats.push(await loadEntryStats({ path: join(params.workTreePath, candidatePath) }));
  }

  return candidateStats;
}

/** `workTreePath` is the folder that holds the `.git` entry that names the git dir `path`. */
type GitDir = { path: string; workTreePath: string };

/**
 * The git dir that the nearest `.git` in `folders`, nearest first, names: a directory, or a file
 * whose first line is `gitdir: <path>`. `null` when no folder holds a `.git`, when the nearest
 * `.git` is a link, another kind, or a file that names no git dir, and when a read fails.
 */
async function findGitDir(params: { folders: string[] }): Promise<GitDir | null> {
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
      return null;
    }
  }

  return null;
}

/**
 * The git dir that the `.git` entry `gitPath` of `kind` in `folder` names; `null` for a link,
 * another kind, a file that names no git dir, and a failed read.
 */
async function loadGitDirOfEntry(params: {
  folder: string;
  gitPath: string;
  kind: FileKind;
}): Promise<GitDir | null> {
  switch (params.kind) {
    case 'directory':
      return { path: params.gitPath, workTreePath: params.folder };
    case 'file': {
      const gitFileText = await loadFileText({ path: params.gitPath });

      if (gitFileText === null) {
        return null;
      }

      const gitDir = parseGitDirFilePath({ text: gitFileText, folder: params.folder });

      if (gitDir === null) {
        return null;
      }

      return { path: gitDir, workTreePath: params.folder };
    }
    case 'symbolicLink':
    case 'other':
      return null;
  }
}
