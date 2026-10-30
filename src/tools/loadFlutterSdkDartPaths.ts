import { lstat, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadFileText } from '../system/loadFileText.js';
import { isJsonObject, parseJsonValue } from '../system/parseJsonValue.js';
import { FLUTTER_SDK_DART_PATH } from './decideDartBinaryPath.js';

/** Bounds the files read when a cache holds many projects, or a crafted one many entries. */
export const ACTIVE_ROOT_FILES_MAX_COUNT = 64;

const ACTIVE_ROOTS_PATH = '.pub-cache/active_roots';

/**
 * Returns the Dart binary path of each distinct Flutter SDK that the projects of
 * `~/.pub-cache/active_roots` name, in the sorted order of their files. A project names its root
 * in a file it may commit, so a root counts only when it holds a `.git` entry, which no cloned
 * tree carries, and its real path is apart from the project's. Unreadable or malformed files and
 * roots whose real path cannot be read are skipped; the binaries themselves are not checked.
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
  });

  if (!accepted) {
    return null;
  }

  return flutterRoot;
}

/** Whether `flutterRoot` is a git checkout apart from `projectRoot`, the folder of `.dart_tool`. */
async function isFlutterRootAccepted(params: {
  flutterRoot: string;
  projectRoot: string;
}): Promise<boolean> {
  const flutterRealPath = await loadRealPath({ path: params.flutterRoot });
  const projectRealPath = await loadRealPath({ path: params.projectRoot });

  if (flutterRealPath === null || projectRealPath === null) {
    return false;
  }

  const apart = isFlutterRootApartFromProject({
    flutterRoot: flutterRealPath,
    projectRoot: projectRealPath,
  });

  if (!apart) {
    return false;
  }

  return isPathPresent({ path: join(flutterRealPath, '.git') });
}

/** `null` when nothing is there, a link dangles, or the path cannot be read. */
async function loadRealPath(params: { path: string }): Promise<string | null> {
  try {
    return await realpath(params.path);
  } catch {
    return null;
  }
}

/** Whether something is at `path` itself, a folder, a file, or a link, without following it. */
async function isPathPresent(params: { path: string }): Promise<boolean> {
  try {
    await lstat(params.path);

    return true;
  } catch {
    return false;
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
