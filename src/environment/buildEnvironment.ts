import { joinAbsolutePath } from '../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { UserIdentity } from '../system/userIdentity.js';

export type Environment = {
  nowMs: number;
  /** The effective user, never root: the environment refuses to start as root. */
  user: UserIdentity;
  pathRules: PathRules;
  homeDir: AbsolutePath;
  tempDir: AbsolutePath;
  /** The per-user folder of the system's own caches, such as macOS's Metal shader caches. */
  userCacheDir: AbsolutePath;
  /** The folders the platform's apps are installed in, whether they exist or not. */
  applicationDirs: AbsolutePath[];
  /** The roots of the file system, which are refused as a whole. */
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
};

export function buildEnvironment(params: {
  nowMs: number;
  user: UserIdentity;
  pathRules: PathRules;
  homeDir: AbsolutePath;
  homeRealPath: AbsolutePath;
  tempDir: AbsolutePath;
  tempRealPath: AbsolutePath;
  userCacheDir: AbsolutePath;
  userCacheRealPath: AbsolutePath;
  /** The folders the platform's apps are installed in, whether they exist or not. */
  applicationDirs: AbsolutePath[];
  /** The real paths of the platform's app folders that exist. */
  applicationRealPaths: AbsolutePath[];
  protectedRootPaths: AbsolutePath[];
  /**
   * Root-like folders below the home folder, which are never removed as a whole, one name per
   * level; the empty list is the home folder itself.
   */
  protectedHomeDirNames: string[][];
  /**
   * Folders below the home folder that are never removed, neither whole nor in part, one name per
   * level.
   */
  sensitiveHomeDirNames: string[][];
  /** Folders inside a sensitive folder that may still go, whole and in part, one name per level. */
  sensitiveExceptionHomeDirNames: string[][];
  /** The cloud folders below the home folder where only an evict is allowed, one name per level. */
  evictHomeDirNames: string[][];
  /** The folder of the deletion log below the home folder, one name per level. */
  deletionLogHomeDirNames: string[];
  /** The folder of the bridge's preference file below the home folder, one name per level. */
  preferencesHomeDirNames: string[];
}): Environment {
  return {
    nowMs: params.nowMs,
    user: params.user,
    pathRules: params.pathRules,
    homeDir: params.homeDir,
    tempDir: params.tempDir,
    userCacheDir: params.userCacheDir,
    applicationDirs: params.applicationDirs,
    protectedRootPaths: params.protectedRootPaths,
    allowedRealRoots: [
      params.homeRealPath,
      params.tempRealPath,
      params.userCacheRealPath,
      ...params.applicationRealPaths,
    ],
    protectedRealPaths: [
      ...params.protectedHomeDirNames.map((names) =>
        joinAbsolutePath({
          rules: params.pathRules,
          parentPath: params.homeRealPath,
          names: names,
        }),
      ),
      params.tempRealPath,
      params.userCacheRealPath,
      ...params.protectedRootPaths,
    ],
    sensitiveRealPaths: [
      ...params.sensitiveHomeDirNames.map((names) =>
        joinAbsolutePath({
          rules: params.pathRules,
          parentPath: params.homeRealPath,
          names: names,
        }),
      ),
      joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.homeRealPath,
        names: params.deletionLogHomeDirNames,
      }),
      joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.homeRealPath,
        names: params.preferencesHomeDirNames,
      }),
    ],
    sensitiveExceptionRealPaths: params.sensitiveExceptionHomeDirNames.map((names) =>
      joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.homeRealPath,
        names: names,
      }),
    ),
    evictRealRoots: params.evictHomeDirNames.map((names) =>
      joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.homeRealPath,
        names: names,
      }),
    ),
    deletionLogPath: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.homeDir,
      names: [...params.deletionLogHomeDirNames, 'deletions.jsonl'],
    }),
    preferencesDir: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.homeDir,
      names: params.preferencesHomeDirNames,
    }),
  };
}
