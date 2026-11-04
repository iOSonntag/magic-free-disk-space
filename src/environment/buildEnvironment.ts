import { join } from 'node:path';
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
  homeRealPath: string;
  tempDir: string;
  tempRealPath: string;
  /** The real paths of the platform's app folders that exist. */
  applicationRealPaths: string[];
  protectedRootPaths: AbsolutePath[];
  /** Root-like folders below the home folder, which are never removed as a whole. */
  protectedHomeRelativePaths: string[];
  /** Folders below the home folder that are never removed, neither whole nor in part. */
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
    protectedRootPaths: params.protectedRootPaths,
    allowedRealRoots: [params.homeRealPath, params.tempRealPath, ...params.applicationRealPaths],
    protectedRealPaths: [
      ...params.protectedHomeRelativePaths.map((relativePath) =>
        join(params.homeRealPath, relativePath),
      ),
      params.tempRealPath,
      ...params.protectedRootPaths,
    ],
    sensitiveRealPaths: [
      ...params.sensitiveHomeRelativePaths.map((relativePath) =>
        join(params.homeRealPath, relativePath),
      ),
      join(params.homeRealPath, ...params.deletionLogHomeDirNames),
      join(params.homeRealPath, ...params.preferencesHomeDirNames),
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
