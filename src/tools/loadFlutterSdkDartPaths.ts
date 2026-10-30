import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isJsonObject, parseJsonValue } from '../system/parseJsonValue.js';
import { FLUTTER_SDK_DART_PATH } from './decideDartBinaryPath.js';

/** Bounds the files read when a cache holds many projects, or a crafted one many entries. */
export const ACTIVE_ROOT_FILES_MAX_COUNT = 64;

const ACTIVE_ROOTS_PATH = '.pub-cache/active_roots';

/**
 * Returns the Dart binary path of each distinct Flutter SDK that the projects of
 * `~/.pub-cache/active_roots` name, in the sorted order of their files. Unreadable or malformed
 * files are skipped; the binaries themselves are not checked.
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

/** Parses an active-roots file into the path of the `package_config.json` it names, else `null`. */
export function parseActiveRootPackageConfigPath(text: string): string | null {
  return parseFileUrlField({ text: text, field: 'package_config' });
}

/** Parses a `package_config.json` into the path of its `flutterRoot`, else `null`. */
export function parsePackageConfigFlutterRoot(text: string): string | null {
  return parseFileUrlField({ text: text, field: 'flutterRoot' });
}

async function loadActiveRootFiles(params: { activeRootsDir: string }): Promise<string[]> {
  const groupNames = await loadSortedNames({ dir: params.activeRootsDir });
  const files: string[] = [];

  for (const groupName of groupNames) {
    const groupDir = join(params.activeRootsDir, groupName);
    const fileNames = await loadSortedNames({ dir: groupDir });

    for (const fileName of fileNames) {
      if (files.length === ACTIVE_ROOT_FILES_MAX_COUNT) {
        return files;
      }

      files.push(join(groupDir, fileName));
    }
  }

  return files;
}

/** Never throws: a folder that cannot be read has no names. */
async function loadSortedNames(params: { dir: string }): Promise<string[]> {
  try {
    const names = await readdir(params.dir);

    return names.toSorted();
  } catch {
    return [];
  }
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

  return parsePackageConfigFlutterRoot(packageConfigText);
}

async function loadFileText(params: { path: string }): Promise<string | null> {
  try {
    return await readFile(params.path, 'utf8');
  } catch {
    return null;
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
