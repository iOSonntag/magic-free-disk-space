import { join } from 'node:path';
import {
  PROTECTED_HOME_RELATIVE_PATHS,
  SENSITIVE_HOME_RELATIVE_PATHS,
} from '../catalog/protectedPaths.js';
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
  applicationDirs: string[];
  /** Homebrew's prefixes, Apple silicon's first, read as files by a probe that runs no `brew`. */
  homebrewPrefixPaths: AbsolutePath[];
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
  applicationDirs: string[];
  applicationRealPaths: string[];
  homebrewPrefixPaths: AbsolutePath[];
  protectedRootPaths: AbsolutePath[];
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
    homebrewPrefixPaths: params.homebrewPrefixPaths,
    protectedRootPaths: params.protectedRootPaths,
    allowedRealRoots: [params.homeRealPath, params.tempRealPath, ...params.applicationRealPaths],
    protectedRealPaths: [
      ...PROTECTED_HOME_RELATIVE_PATHS.map((relativePath) =>
        join(params.homeRealPath, relativePath),
      ),
      params.tempRealPath,
      ...params.protectedRootPaths,
    ],
    sensitiveRealPaths: [
      ...SENSITIVE_HOME_RELATIVE_PATHS.map((relativePath) =>
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
