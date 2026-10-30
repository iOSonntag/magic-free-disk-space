import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import { loadFileText } from '../system/loadFileText.js';
import { loadRealPath } from '../system/loadRealPath.js';
import { isJsonObject, parseJsonValue } from '../system/parseJsonValue.js';
import { FLUTTER_SDK_DART_PATH } from './decideDartBinaryPath.js';
import { PACKAGE_CONFIG_FILE_NAME } from './decidePackageConfigTracking.js';
import { TOOL_FILE_MAX_BYTES } from './limits.js';
import { loadPackageConfigTracking } from './loadPackageConfigTracking.js';

/** Bounds the files read when a cache holds many projects, or a crafted one many entries. */
export const ACTIVE_ROOT_FILES_MAX_COUNT = 64;

const ACTIVE_ROOTS_PATH = '.pub-cache/active_roots';

/**
 * Returns the Dart binary path of each distinct Flutter SDK that the projects of
 * `~/.pub-cache/active_roots` name, in the sorted order of their files. A root counts only when it
 * holds a `.git` entry, is disjoint from its project, and comes from the plain file
 * `<project>/.dart_tool/package_config.json` that `loadPackageConfigTracking` finds untracked.
 * Anything unreadable or malformed is skipped.
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
  const activeRootText = await loadFileText({
    path: params.activeRootFile,
    maxBytes: TOOL_FILE_MAX_BYTES,
  });

  if (activeRootText.kind === 'failed') {
    return null;
  }

  const packageConfigPath = parseActiveRootPackageConfigPath(activeRootText.value);

  if (packageConfigPath === null) {
    return null;
  }

  const packageConfigText = await loadFileText({
    path: packageConfigPath,
    maxBytes: TOOL_FILE_MAX_BYTES,
  });

  if (packageConfigText.kind === 'failed') {
    return null;
  }

  const flutterRoot = parsePackageConfigFlutterRoot(packageConfigText.value);

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
 * that `loadPackageConfigTracking` finds untracked.
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
