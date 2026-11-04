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
  tempDir: string;
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
  tempDir: string;
  tempRealPath: AbsolutePath;
  /** The folders the platform's apps are installed in, whether they exist or not. */
  applicationDirs: AbsolutePath[];
  /** The real paths of the platform's app folders that exist. */
  applicationRealPaths: AbsolutePath[];
  protectedRootPaths: AbsolutePath[];
  /**
   * Root-like folders below the home folder, which are never removed as a whole, spelled with the
   * separator of `pathRules`; the empty path is the home folder itself.
   */
  protectedHomeRelativePaths: string[];
  /**
   * Folders below the home folder that are never removed, neither whole nor in part, spelled with
   * the separator of `pathRules`.
   */
  sensitiveHomeRelativePaths: string[];
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
    applicationDirs: params.applicationDirs,
    protectedRootPaths: params.protectedRootPaths,
    allowedRealRoots: [params.homeRealPath, params.tempRealPath, ...params.applicationRealPaths],
    protectedRealPaths: [
      ...params.protectedHomeRelativePaths.map((relativePath) =>
        joinHomeRelativePath({
          rules: params.pathRules,
          homeRealPath: params.homeRealPath,
          relativePath: relativePath,
        }),
      ),
      params.tempRealPath,
      ...params.protectedRootPaths,
    ],
    sensitiveRealPaths: [
      ...params.sensitiveHomeRelativePaths.map((relativePath) =>
        joinHomeRelativePath({
          rules: params.pathRules,
          homeRealPath: params.homeRealPath,
          relativePath: relativePath,
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

/** The real path of a folder below the home folder, its relative path spelled under `rules`. */
function joinHomeRelativePath(params: {
  rules: PathRules;
  homeRealPath: AbsolutePath;
  relativePath: string;
}): AbsolutePath {
  const names = params.relativePath.split(params.rules.separator).filter((name) => name !== '');

  return joinAbsolutePath({ rules: params.rules, parentPath: params.homeRealPath, names: names });
}
