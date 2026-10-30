import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import { loadFileBytes } from '../system/loadFileBytes.js';
import type { FileKind } from '../system/loadFileIdentity.js';
import { loadFileText } from '../system/loadFileText.js';
import { loadRealPath } from '../system/loadRealPath.js';
import { isJsonObject, parseJsonValue } from '../system/parseJsonValue.js';
import { FLUTTER_SDK_DART_PATH } from './decideDartBinaryPath.js';
import type { PackageConfigTracking } from './decidePackageConfigTracking.js';
import {
  decidePackageConfigTracking,
  PACKAGE_CONFIG_FILE_NAME,
} from './decidePackageConfigTracking.js';
import { parseGitDirFilePath } from './parseGitDirFilePath.js';

/** Bounds the files read when a cache holds many projects, or a crafted one many entries. */
export const ACTIVE_ROOT_FILES_MAX_COUNT = 64;

const ACTIVE_ROOTS_PATH = '.pub-cache/active_roots';

const GIT_INDEX_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Working-copy markers of version control systems other than git, which can restore a tracked file
 * as git can.
 */
const otherVersionControlMarkerNames = [
  '.jj',
  '.hg',
  '.sl',
  '.svn',
  '.bzr',
  '_darcs',
  '.pijul',
  '.fslckout',
  '_FOSSIL_',
  'CVS',
];

/**
 * Returns the Dart binary path of each distinct Flutter SDK that the projects of
 * `~/.pub-cache/active_roots` name, in the sorted order of their files. A root counts only when it
 * holds a `.git` entry, is disjoint from its project, and comes from the plain file
 * `<project>/.dart_tool/package_config.json` that pub wrote: a repository git finds for it must
 * exist, its index be readable and not name it, and no folder up to `/` hold a marker of another
 * version control. Anything unreadable or malformed is skipped.
 */
export async function loadFlutterSdkDartPaths(params: { homeDir: string }): Promise<string[]> {
  const activeRootFiles = await loadActiveRootFiles({
    activeRootsDir: join(params.homeDir, ACTIVE_ROOTS_PATH),
  });
  const flutterRoots: string[] = [];

  for (const activeRootFile of activeRootFiles) {
    const flutterRoot = await loadFlutterRoot({ activeRootFile: activeRootFile });

    if (flutterRoot !== null && !flutterRoots.includes(flutterRoot)) {
      flutterRoots.push(flutterRoot);
    }
  }

  return flutterRoots.map((flutterRoot) => join(flutterRoot, FLUTTER_SDK_DART_PATH));
}

/**
 * Whether the real paths of a Flutter root and of the project that names it are disjoint, neither
 * equal to nor inside the other.
 */
export function isFlutterRootApartFromProject(params: {
  flutterRoot: string;
  projectRoot: string;
}): boolean {
  const flutterRootInProject = isSameOrInsidePath({
    path: params.flutterRoot,
    parentPath: params.projectRoot,
  });
  const projectInFlutterRoot = isSameOrInsidePath({
    path: params.projectRoot,
    parentPath: params.flutterRoot,
  });

  return !flutterRootInProject && !projectInFlutterRoot;
}

/** Parses an active-roots file into the path of the `package_config.json` it names, else `null`. */
export function parseActiveRootPackageConfigPath(text: string): string | null {
  return parseFileUrlField({ text: text, field: 'package_config' });
}

/** Parses a `package_config.json` into the path of its `flutterRoot`, else `null`. */
export function parsePackageConfigFlutterRoot(text: string): string | null {
  return parseFileUrlField({ text: text, field: 'flutterRoot' });
}

async function loadActiveRootFiles(params: { activeRootsDir: string }): Promise<string[]> {
  const groupNames = await loadDirectoryNames({ path: params.activeRootsDir });

  if (groupNames.kind === 'failed') {
    return [];
  }

  const files: string[] = [];

  for (const groupName of groupNames.value) {
    const groupDir = join(params.activeRootsDir, groupName);
    const fileNames = await loadDirectoryNames({ path: groupDir });

    if (fileNames.kind === 'failed') {
      continue;
    }

    for (const fileName of fileNames.value) {
      if (files.length === ACTIVE_ROOT_FILES_MAX_COUNT) {
        return files;
      }

      files.push(join(groupDir, fileName));
    }
  }

  return files;
}

async function loadFlutterRoot(params: { activeRootFile: string }): Promise<string | null> {
  const activeRootText = await loadFileText({ path: params.activeRootFile });

  if (activeRootText === null) {
    return null;
  }

  const packageConfigPath = parseActiveRootPackageConfigPath(activeRootText);

  if (packageConfigPath === null) {
    return null;
  }

  const packageConfigText = await loadFileText({ path: packageConfigPath });

  if (packageConfigText === null) {
    return null;
  }

  const flutterRoot = parsePackageConfigFlutterRoot(packageConfigText);

  if (flutterRoot === null) {
    return null;
  }

  const accepted = await isFlutterRootAccepted({
    flutterRoot: flutterRoot,
    projectRoot: dirname(dirname(packageConfigPath)),
    packageConfigPath: packageConfigPath,
  });

  if (!accepted) {
    return null;
  }

  return flutterRoot;
}

/**
 * Whether `flutterRoot` is a git checkout apart from `projectRoot`, the folder of `.dart_tool`,
 * named by `packageConfigPath`, the plain file `.dart_tool/package_config.json` of the project
 * that a readable git index does not name, with no other version control up to `/`.
 */
async function isFlutterRootAccepted(params: {
  flutterRoot: string;
  projectRoot: string;
  packageConfigPath: string;
}): Promise<boolean> {
  const flutterRealPath = await loadRealPath({ path: params.flutterRoot });
  const projectRealPath = await loadRealPath({ path: params.projectRoot });
  const packageConfigRealPath = await loadRealPath({ path: params.packageConfigPath });

  if (flutterRealPath === null || projectRealPath === null || packageConfigRealPath === null) {
    return false;
  }

  const apart = isFlutterRootApartFromProject({
    flutterRoot: flutterRealPath,
    projectRoot: projectRealPath,
  });

  if (!apart) {
    return false;
  }

  const gitEntryStats = await loadEntryStats({ path: join(flutterRealPath, '.git') });

  if (gitEntryStats.kind === 'failed') {
    return false;
  }

  const projectDartToolPath = join(projectRealPath, '.dart_tool');

  if (packageConfigRealPath !== join(projectDartToolPath, PACKAGE_CONFIG_FILE_NAME)) {
    return false;
  }

  const tracking = await loadPackageConfigTracking({ dartToolRealPath: projectDartToolPath });

  return tracking === 'untracked';
}

/**
 * Whether the index of the repository git finds from `dartToolRealPath` names the package config:
 * `unknown` without a repository, with a marker of another version control in any folder up to
 * `/`, or when a lookup, the repository, or its index cannot be read whole.
 */
async function loadPackageConfigTracking(params: {
  dartToolRealPath: string;
}): Promise<PackageConfigTracking> {
  const folders = buildFolderPathsUpToRoot(params.dartToolRealPath);
  const clearOfOtherVersionControl = await isClearOfOtherVersionControl({ folders: folders });

  if (!clearOfOtherVersionControl) {
    return 'unknown';
  }

  const gitDir = await findGitDir({ folders: folders });

  switch (gitDir.kind) {
    case 'none':
    case 'unreadable':
      return 'unknown';
    case 'found':
      return await loadGitDirPackageConfigTracking({ gitDir: gitDir.path });
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
 * Whether none of `folders` holds a marker of another version control; `false` too when an lstat
 * fails for a reason other than a missing entry.
 */
async function isClearOfOtherVersionControl(params: { folders: string[] }): Promise<boolean> {
  for (const folder of params.folders) {
    for (const markerName of otherVersionControlMarkerNames) {
      const markerStats = await loadEntryStats({ path: join(folder, markerName) });

      if (markerStats.kind === 'succeeded' || markerStats.failure.reason !== 'missing') {
        return false;
      }
    }
  }

  return true;
}

async function loadGitDirPackageConfigTracking(params: {
  gitDir: string;
}): Promise<PackageConfigTracking> {
  const gitDirNames = await loadDirectoryNames({ path: params.gitDir });

  if (gitDirNames.kind === 'failed') {
    return 'unknown';
  }

  // A split index keeps most entries in `sharedindex.<sha>`, outside `$GIT_DIR/index`.
  if (gitDirNames.value.some((name) => name.startsWith('sharedindex.'))) {
    return 'unknown';
  }

  const indexBytes = await loadFileBytes({
    path: join(params.gitDir, 'index'),
    maxBytes: GIT_INDEX_MAX_BYTES,
  });

  if (indexBytes === null) {
    return 'unknown';
  }

  return decidePackageConfigTracking(indexBytes);
}

type GitDirLookupFound = { kind: 'found'; path: string };

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
      return { kind: 'found', path: params.gitPath };
    case 'file': {
      const gitFileText = await loadFileText({ path: params.gitPath });

      if (gitFileText === null) {
        return { kind: 'unreadable' };
      }

      const gitDir = parseGitDirFilePath({ text: gitFileText, folder: params.folder });

      if (gitDir === null) {
        return { kind: 'unreadable' };
      }

      return { kind: 'found', path: gitDir };
    }
    case 'symbolicLink':
    case 'other':
      return { kind: 'unreadable' };
  }
}

function parseFileUrlField(params: { text: string; field: string }): string | null {
  const json = parseJsonValue({ text: params.text });

  if (json.kind === 'failed' || !isJsonObject(json.value)) {
    return null;
  }

  const value = json.value[params.field];

  if (typeof value !== 'string') {
    return null;
  }

  return parseFileUrlPath(value);
}

/** The absolute path of a `file:` URL, else `null`. */
function parseFileUrlPath(url: string): string | null {
  try {
    return fileURLToPath(url);
  } catch {
    return null;
  }
}
