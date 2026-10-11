import { join } from 'node:path';
import {
  DELETION_LOG_HOME_RELATIVE_DIR,
  PROTECTED_HOME_RELATIVE_PATHS,
  SENSITIVE_HOME_RELATIVE_PATHS,
} from '../catalog/protectedPaths.js';

export type Environment = {
  platform: string;
  nowMs: number;
  homeDir: string;
  tempDir: string;
  applicationDirs: string[];
  /** Real paths under which a removal is allowed. */
  allowedRealRoots: string[];
  /** Real paths that are refused as a whole; their children may still go. */
  protectedRealPaths: string[];
  /** Real paths that are refused whole and in every part, such as keys and the deletion log. */
  sensitiveRealPaths: string[];
  deletionLogPath: string;
};

export function buildEnvironment(params: {
  platform: string;
  nowMs: number;
  homeDir: string;
  homeRealPath: string;
  tempDir: string;
  tempRealPath: string;
  applicationDirs: string[];
  applicationRealPaths: string[];
}): Environment {
  return {
    platform: params.platform,
    nowMs: params.nowMs,
    homeDir: params.homeDir,
    tempDir: params.tempDir,
    applicationDirs: params.applicationDirs,
    allowedRealRoots: [params.homeRealPath, params.tempRealPath, ...params.applicationRealPaths],
    protectedRealPaths: [
      ...PROTECTED_HOME_RELATIVE_PATHS.map((relativePath) =>
        join(params.homeRealPath, relativePath),
      ),
      params.tempRealPath,
      '/',
    ],
    sensitiveRealPaths: SENSITIVE_HOME_RELATIVE_PATHS.map((relativePath) =>
      join(params.homeRealPath, relativePath),
    ),
    deletionLogPath: join(params.homeDir, DELETION_LOG_HOME_RELATIVE_DIR, 'deletions.jsonl'),
  };
}
