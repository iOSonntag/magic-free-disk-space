import type { DriveRoot } from '../path/driveRoot.js';
import { joinAbsolutePath } from '../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { UserIdentity } from '../system/userIdentity.js';
import type { EnvironmentLocation, EnvironmentLocationAtRoot } from './environmentLocation.js';
import { findEnvironmentLocationPath, resolveEnvironmentLocation } from './environmentLocation.js';

/** Windows' two AppData folders of the user, which may lie outside the home folder. */
export type AppDataDirs = { localDir: AbsolutePath; roamingDir: AbsolutePath };

/**
 * The known folders of Windows the tool reads, each named after its `FOLDERID`. Known Folder Move
 * and Folder Redirection can move them anywhere, such as into OneDrive.
 */
export type WindowsKnownFolder =
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'videos'
  | 'music'
  | 'pictures'
  | 'localAppDataLow'
  | 'skyDrive';

/** The path Windows names for each known folder; `null` for one it names none for. */
export type WindowsKnownFolderPaths = Record<WindowsKnownFolder, AbsolutePath | null>;

/** The folder of the system's own caches that macOS keeps per user, such as for Metal shaders. */
export type PlatformFoldersDarwin = { kind: 'darwin'; userCacheDir: AbsolutePath };

/** The AppData folders and the known folders of Windows, which keeps its caches in LocalAppData. */
export type PlatformFoldersWin32 = {
  kind: 'win32';
  appDataDirs: AppDataDirs;
  knownFolderPaths: WindowsKnownFolderPaths;
};

/** The folders of the run that only its platform has. */
export type PlatformFolders = PlatformFoldersDarwin | PlatformFoldersWin32;

/** The POSIX modes that keep a folder and a file the tool writes to its user alone. */
export type OwnerOnlyModes = { directoryMode: number; fileMode: number };

export type Environment = {
  nowMs: number;
  /**
   * The effective user, never root: the environment refuses to start as root, and on Windows with
   * an elevated token.
   */
  user: UserIdentity;
  pathRules: PathRules;
  homeDir: AbsolutePath;
  tempDir: AbsolutePath;
  platformFolders: PlatformFolders;
  /** The folders the platform's apps are installed in, whether they exist or not. */
  applicationDirs: AbsolutePath[];
  /** The root of each fixed drive of Windows, each with its Recycle Bin; empty on macOS. */
  fixedDriveRoots: DriveRoot[];
  /** Real paths under which a removal is allowed. */
  allowedRealRoots: string[];
  /** Real paths that are refused as a whole; their children may still go. */
  protectedRealPaths: string[];
  /** Real paths that are refused whole and in every part, such as keys and the deletion log. */
  sensitiveRealPaths: string[];
  /**
   * Real paths inside a sensitive path that may go whole and in every part, such as an app's
   * preview caches; a path that holds one is still refused.
   */
  sensitiveExceptionRealPaths: string[];
  /**
   * Real paths of the cloud folders whose files only an evict may take off this Mac: never
   * deleted, neither whole nor in part, since a delete there deletes the file on every device.
   */
  evictRealRoots: string[];
  deletionLogPath: string;
  /** The folder of the bridge's preference file. */
  preferencesDir: AbsolutePath;
  /**
   * The modes of the folders and files the tool writes; `null` on Windows, whose files take the
   * access list of the profile folder they lie in instead.
   */
  ownerOnlyModes: OwnerOnlyModes | null;
};

/**
 * The folders of a run a location is resolved below, by their paths or by their real paths, with
 * the rules of the platform's paths.
 */
export type EnvironmentFolders = Pick<
  Environment,
  'pathRules' | 'homeDir' | 'tempDir' | 'platformFolders'
>;

/**
 * The environment of a run from the values its platform read. Throws for a location below a
 * folder its platform does not have, which is a bug of the platform's lists.
 */
export function buildEnvironment(params: {
  nowMs: number;
  user: UserIdentity;
  pathRules: PathRules;
  homeDir: AbsolutePath;
  homeRealPath: AbsolutePath;
  tempDir: AbsolutePath;
  tempRealPath: AbsolutePath;
  platformFolders: PlatformFolders;
  /** The real paths of `platformFolders`, of the same platform. */
  platformRealFolders: PlatformFolders;
  /** The folders the platform's apps are installed in, whether they exist or not. */
  applicationDirs: AbsolutePath[];
  /** The real paths of the platform's app folders that exist. */
  applicationRealPaths: AbsolutePath[];
  /**
   * The roots of the file system, which are refused as a whole: `/` on macOS, and on Windows the
   * root of each fixed drive, one per drive.
   */
  protectedRootPaths: AbsolutePath[];
  fixedDriveRoots: DriveRoot[];
  /**
   * Root-like folders, which are never removed as a whole; one in a known folder Windows names no
   * path for is left out.
   */
  protectedLocations: EnvironmentLocation[];
  /** Real paths the platform resolved itself that are never removed as a whole, such as OneDrive's. */
  protectedFolderRealPaths: AbsolutePath[];
  /** Folders that are never removed, neither whole nor in part. */
  sensitiveLocations: EnvironmentLocationAtRoot[];
  /** Folders inside a sensitive folder that may still go, whole and in part. */
  sensitiveExceptionLocations: EnvironmentLocationAtRoot[];
  /** The cloud folders where only an evict is allowed. */
  evictLocations: EnvironmentLocationAtRoot[];
  /** The folder of the deletion log. */
  deletionLogLocation: EnvironmentLocationAtRoot;
  /** The folder of the bridge's preference file. */
  preferencesLocation: EnvironmentLocationAtRoot;
  ownerOnlyModes: OwnerOnlyModes | null;
}): Environment {
  const folders: EnvironmentFolders = {
    pathRules: params.pathRules,
    homeDir: params.homeDir,
    tempDir: params.tempDir,
    platformFolders: params.platformFolders,
  };
  const realFolders: EnvironmentFolders = {
    pathRules: params.pathRules,
    homeDir: params.homeRealPath,
    tempDir: params.tempRealPath,
    platformFolders: params.platformRealFolders,
  };
  const platformBaseRealPaths = listPlatformBaseDirs({
    platformFolders: params.platformRealFolders,
  });
  const protectedLocationRealPaths = params.protectedLocations.flatMap((location) => {
    const realPath = findEnvironmentLocationPath({ folders: realFolders, location: location });

    return realPath === null ? [] : [realPath];
  });

  return {
    nowMs: params.nowMs,
    user: params.user,
    pathRules: params.pathRules,
    homeDir: params.homeDir,
    tempDir: params.tempDir,
    platformFolders: params.platformFolders,
    applicationDirs: params.applicationDirs,
    fixedDriveRoots: params.fixedDriveRoots,
    allowedRealRoots: [
      params.homeRealPath,
      params.tempRealPath,
      ...platformBaseRealPaths,
      ...params.applicationRealPaths,
    ],
    protectedRealPaths: [
      ...protectedLocationRealPaths,
      ...params.protectedFolderRealPaths,
      params.tempRealPath,
      ...platformBaseRealPaths,
      ...params.protectedRootPaths,
    ],
    sensitiveRealPaths: resolveLocations({
      folders: realFolders,
      locations: [
        ...params.sensitiveLocations,
        params.deletionLogLocation,
        params.preferencesLocation,
      ],
    }),
    sensitiveExceptionRealPaths: resolveLocations({
      folders: realFolders,
      locations: params.sensitiveExceptionLocations,
    }),
    evictRealRoots: resolveLocations({ folders: realFolders, locations: params.evictLocations }),
    deletionLogPath: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: resolveEnvironmentLocation({
        folders: folders,
        location: params.deletionLogLocation,
      }),
      names: ['deletions.jsonl'],
    }),
    preferencesDir: resolveEnvironmentLocation({
      folders: folders,
      location: params.preferencesLocation,
    }),
    ownerOnlyModes: params.ownerOnlyModes,
  };
}

function resolveLocations(params: {
  folders: EnvironmentFolders;
  locations: EnvironmentLocationAtRoot[];
}): AbsolutePath[] {
  return params.locations.map((location) =>
    resolveEnvironmentLocation({ folders: params.folders, location: location }),
  );
}

/**
 * The base folders only the platform has, each an allowed root that is refused as a whole: macOS'
 * folder of the system's caches, and Windows' two AppData folders.
 */
function listPlatformBaseDirs(params: { platformFolders: PlatformFolders }): AbsolutePath[] {
  switch (params.platformFolders.kind) {
    case 'darwin':
      return [params.platformFolders.userCacheDir];
    case 'win32':
      return [
        params.platformFolders.appDataDirs.localDir,
        params.platformFolders.appDataDirs.roamingDir,
      ];
  }
}
