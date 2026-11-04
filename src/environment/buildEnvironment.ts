import { joinAbsolutePath } from '../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { UserIdentity } from '../system/userIdentity.js';

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

/** The POSIX modes that keep a folder and a file the tool writes to its user alone. */
export type OwnerOnlyModes = { directoryMode: number; fileMode: number };

/** A folder of the run below which the platform names the folders it guards or writes. */
export type EnvironmentBase = 'home' | 'localAppData' | 'roamingAppData';

/** A folder below a base folder of the run, one name per level; no name is the base itself. */
export type EnvironmentDirNames = { base: EnvironmentBase; names: string[] };

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
  /**
   * The per-user folder of the system's own caches, such as macOS's Metal shader caches; `null` on
   * Windows, which keeps its caches in LocalAppData.
   */
  userCacheDir: AbsolutePath | null;
  /** `null` on macOS, which has no AppData folders. */
  appDataDirs: AppDataDirs | null;
  /** `null` on macOS, which has no known folders. */
  knownFolderPaths: WindowsKnownFolderPaths | null;
  /** The folders the platform's apps are installed in, whether they exist or not. */
  applicationDirs: AbsolutePath[];
  /**
   * The roots of the file system, which are refused as a whole: `/` on macOS, and on Windows the
   * root of each fixed drive, one per drive.
   */
  protectedRootPaths: AbsolutePath[];
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
 * The environment of a run from the values its platform read. Throws for a folder named below an
 * AppData folder when `appData` is `null`, which is a bug of the platform's lists.
 */
export function buildEnvironment(params: {
  nowMs: number;
  user: UserIdentity;
  pathRules: PathRules;
  homeDir: AbsolutePath;
  homeRealPath: AbsolutePath;
  tempDir: AbsolutePath;
  tempRealPath: AbsolutePath;
  /** The folder of the system's caches and its real path; `null` where the platform has none. */
  userCache: { dir: AbsolutePath; realPath: AbsolutePath } | null;
  /** The AppData folders and their real paths; `null` where the platform has none. */
  appData: { dirs: AppDataDirs; realDirs: AppDataDirs } | null;
  knownFolderPaths: WindowsKnownFolderPaths | null;
  /** The folders the platform's apps are installed in, whether they exist or not. */
  applicationDirs: AbsolutePath[];
  /** The real paths of the platform's app folders that exist. */
  applicationRealPaths: AbsolutePath[];
  protectedRootPaths: AbsolutePath[];
  /** Root-like folders below the base folders, which are never removed as a whole. */
  protectedDirNames: EnvironmentDirNames[];
  /**
   * Real paths the platform resolved itself that are never removed as a whole, such as Windows'
   * known folders and the roots of OneDrive.
   */
  protectedFolderRealPaths: AbsolutePath[];
  /** Folders below the base folders that are never removed, neither whole nor in part. */
  sensitiveDirNames: EnvironmentDirNames[];
  /** Folders inside a sensitive folder that may still go, whole and in part. */
  sensitiveExceptionDirNames: EnvironmentDirNames[];
  /** The cloud folders where only an evict is allowed. */
  evictDirNames: EnvironmentDirNames[];
  /** The folder of the deletion log. */
  deletionLogDirNames: EnvironmentDirNames;
  /** The folder of the bridge's preference file. */
  preferencesDirNames: EnvironmentDirNames;
  ownerOnlyModes: OwnerOnlyModes | null;
}): Environment {
  const bases: BaseDirs = { home: params.homeDir, appDataDirs: params.appData?.dirs ?? null };
  const realBases: BaseDirs = {
    home: params.homeRealPath,
    appDataDirs: params.appData?.realDirs ?? null,
  };
  const userCacheRealPaths = params.userCache === null ? [] : [params.userCache.realPath];

  function joinBelowRealBase(dirNames: EnvironmentDirNames): AbsolutePath {
    return joinBelowBase({ pathRules: params.pathRules, bases: realBases, dirNames: dirNames });
  }

  return {
    nowMs: params.nowMs,
    user: params.user,
    pathRules: params.pathRules,
    homeDir: params.homeDir,
    tempDir: params.tempDir,
    userCacheDir: params.userCache?.dir ?? null,
    appDataDirs: params.appData?.dirs ?? null,
    knownFolderPaths: params.knownFolderPaths,
    applicationDirs: params.applicationDirs,
    protectedRootPaths: params.protectedRootPaths,
    allowedRealRoots: [
      params.homeRealPath,
      params.tempRealPath,
      ...userCacheRealPaths,
      ...(params.appData === null
        ? []
        : [params.appData.realDirs.localDir, params.appData.realDirs.roamingDir]),
      ...params.applicationRealPaths,
    ],
    protectedRealPaths: [
      ...params.protectedDirNames.map(joinBelowRealBase),
      ...params.protectedFolderRealPaths,
      params.tempRealPath,
      ...userCacheRealPaths,
      ...params.protectedRootPaths,
    ],
    sensitiveRealPaths: [
      ...params.sensitiveDirNames,
      params.deletionLogDirNames,
      params.preferencesDirNames,
    ].map(joinBelowRealBase),
    sensitiveExceptionRealPaths: params.sensitiveExceptionDirNames.map(joinBelowRealBase),
    evictRealRoots: params.evictDirNames.map(joinBelowRealBase),
    deletionLogPath: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: joinBelowBase({
        pathRules: params.pathRules,
        bases: bases,
        dirNames: params.deletionLogDirNames,
      }),
      names: ['deletions.jsonl'],
    }),
    preferencesDir: joinBelowBase({
      pathRules: params.pathRules,
      bases: bases,
      dirNames: params.preferencesDirNames,
    }),
    ownerOnlyModes: params.ownerOnlyModes,
  };
}

/** The base folders by their display paths, or by their real paths. */
type BaseDirs = { home: AbsolutePath; appDataDirs: AppDataDirs | null };

function joinBelowBase(params: {
  pathRules: PathRules;
  bases: BaseDirs;
  dirNames: EnvironmentDirNames;
}): AbsolutePath {
  return joinAbsolutePath({
    rules: params.pathRules,
    parentPath: findBasePath({ bases: params.bases, base: params.dirNames.base }),
    names: params.dirNames.names,
  });
}

function findBasePath(params: { bases: BaseDirs; base: EnvironmentBase }): AbsolutePath {
  switch (params.base) {
    case 'home':
      return params.bases.home;
    case 'localAppData':
      return requireAppDataDirs({ appDataDirs: params.bases.appDataDirs }).localDir;
    case 'roamingAppData':
      return requireAppDataDirs({ appDataDirs: params.bases.appDataDirs }).roamingDir;
  }
}

function requireAppDataDirs(params: { appDataDirs: AppDataDirs | null }): AppDataDirs {
  if (params.appDataDirs === null) {
    throw new Error('A folder is named below AppData on a platform without AppData folders.');
  }

  return params.appDataDirs;
}
