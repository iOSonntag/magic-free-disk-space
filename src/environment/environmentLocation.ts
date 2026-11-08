import { joinAbsolutePath } from '../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../path/parseAbsolutePath.js';
import type {
  EnvironmentFolders,
  PlatformFolders,
  PlatformFoldersDarwin,
  PlatformFoldersWin32,
  WindowsKnownFolder,
} from './buildEnvironment.js';

/**
 * A folder of the run that a location may lie below: the home folder, the temporary folder,
 * macOS' per-user folder of the system's caches for `userCache`, or Windows' two AppData folders.
 */
export type EnvironmentBase = 'home' | 'temp' | 'userCache' | 'localAppData' | 'roamingAppData';

/** The folder a fixed location is named below: a base folder, or none for `absolute`. */
export type LocationRoot = EnvironmentBase | 'absolute';

/**
 * A folder or file at a fixed place of the run: relative to its root, with `/` between its names
 * on every platform and `''` for the root itself, or the whole path for `absolute`.
 */
export type EnvironmentLocationAtRoot = { root: LocationRoot; path: string };

/** The place at `path`, its names joined by `/`, below `location`, at the same root. */
export function buildLocationBelow(params: {
  location: EnvironmentLocationAtRoot;
  path: string;
}): EnvironmentLocationAtRoot {
  if (params.location.path === '') {
    return { root: params.location.root, path: params.path };
  }

  return { root: params.location.root, path: `${params.location.path}/${params.path}` };
}

/**
 * A folder or file in a known folder of Windows, wherever the user moved it, relative to the known
 * folder as a fixed location is to its root.
 */
export type EnvironmentLocationInKnownFolder = {
  root: 'knownFolder';
  folder: WindowsKnownFolder;
  path: string;
};

/** A folder or file the platform names, by the folder of the run it lies in. */
export type EnvironmentLocation = EnvironmentLocationAtRoot | EnvironmentLocationInKnownFolder;

/**
 * The absolute path of a fixed location below the folders, which may be the paths or the real
 * paths of the run's folders. Throws for a `userCache` root on Windows, an AppData root on macOS,
 * a whole path that is not absolute, and a name that is no entry, each a bug of the platform's
 * data.
 */
export function resolveEnvironmentLocation(params: {
  folders: EnvironmentFolders;
  location: EnvironmentLocationAtRoot;
}): AbsolutePath {
  if (params.location.root === 'absolute') {
    return parseWholePath({ folders: params.folders, text: params.location.path });
  }

  return joinLocationPath({
    folders: params.folders,
    baseDir: getEnvironmentBaseDir({ folders: params.folders, base: params.location.root }),
    path: params.location.path,
  });
}

/**
 * The absolute path of each fixed location below the folders, in their order. Throws as
 * `resolveEnvironmentLocation` does.
 */
export function resolveEnvironmentLocations(params: {
  folders: EnvironmentFolders;
  locations: EnvironmentLocationAtRoot[];
}): AbsolutePath[] {
  return params.locations.map((location) =>
    resolveEnvironmentLocation({ folders: params.folders, location: location }),
  );
}

/**
 * The absolute path of any location below the folders; `null` for one in a known folder Windows
 * names no path for. Throws as `resolveEnvironmentLocation` does, and for a known folder on macOS.
 */
export function findEnvironmentLocationPath(params: {
  folders: EnvironmentFolders;
  location: EnvironmentLocation;
}): AbsolutePath | null {
  if (params.location.root !== 'knownFolder') {
    return resolveEnvironmentLocation({ folders: params.folders, location: params.location });
  }

  const knownFolderPath = requireWin32Folders({
    platformFolders: params.folders.platformFolders,
  }).knownFolderPaths[params.location.folder];

  if (knownFolderPath === null) {
    return null;
  }

  return joinLocationPath({
    folders: params.folders,
    baseDir: knownFolderPath,
    path: params.location.path,
  });
}

/**
 * The absolute path of each location below the folders, in their order; one in a known folder
 * Windows names no path for is left out. Throws as `findEnvironmentLocationPath` does.
 */
export function findEnvironmentLocationPaths(params: {
  folders: EnvironmentFolders;
  locations: EnvironmentLocation[];
}): AbsolutePath[] {
  return params.locations.flatMap((location) => {
    const path = findEnvironmentLocationPath({ folders: params.folders, location: location });

    return path === null ? [] : [path];
  });
}

function getEnvironmentBaseDir(params: {
  folders: EnvironmentFolders;
  base: EnvironmentBase;
}): AbsolutePath {
  switch (params.base) {
    case 'home':
      return params.folders.homeDir;
    case 'temp':
      return params.folders.tempDir;
    case 'userCache':
      return requireDarwinFolders({ platformFolders: params.folders.platformFolders }).userCacheDir;
    case 'localAppData':
      return requireWin32Folders({ platformFolders: params.folders.platformFolders }).appDataDirs
        .localDir;
    case 'roamingAppData':
      return requireWin32Folders({ platformFolders: params.folders.platformFolders }).appDataDirs
        .roamingDir;
  }
}

function requireDarwinFolders(params: { platformFolders: PlatformFolders }): PlatformFoldersDarwin {
  switch (params.platformFolders.kind) {
    case 'darwin':
      return params.platformFolders;
    case 'win32':
      throw new Error('A location lies below the user cache on Windows, which has none.');
  }
}

function requireWin32Folders(params: { platformFolders: PlatformFolders }): PlatformFoldersWin32 {
  switch (params.platformFolders.kind) {
    case 'win32':
      return params.platformFolders;
    case 'darwin':
      throw new Error('A location lies below a folder of Windows on macOS.');
  }
}

function parseWholePath(params: { folders: EnvironmentFolders; text: string }): AbsolutePath {
  const path = parseAbsolutePath({ rules: params.folders.pathRules, text: params.text });

  if (path.kind === 'failed') {
    throw new Error(`The location ${params.text} is not absolute.`);
  }

  return path.value;
}

function joinLocationPath(params: {
  folders: EnvironmentFolders;
  baseDir: AbsolutePath;
  path: string;
}): AbsolutePath {
  return joinAbsolutePath({
    rules: params.folders.pathRules,
    parentPath: params.baseDir,
    names: params.path === '' ? [] : params.path.split('/'),
  });
}
