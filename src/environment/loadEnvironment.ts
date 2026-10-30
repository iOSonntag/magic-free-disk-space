import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { Result } from '../result.js';
import { SCAN_LIMITS } from '../scan/limits.js';
import { getErrorCode } from '../system/getErrorCode.js';
import { loadCommandOutput } from '../system/loadCommandOutput.js';
import type { Environment } from './buildEnvironment.js';
import { buildEnvironment } from './buildEnvironment.js';
import { checkEnvironmentRoots } from './checkEnvironmentRoots.js';

export type EnvironmentFailure =
  | { reason: 'unsupportedPlatform'; platform: string }
  | { reason: 'runAsRoot' }
  | { reason: 'unresolvable'; path: string; code: string }
  | { reason: 'homeNotOwned'; path: string }
  | { reason: 'tempOverlapsHome'; path: string };

/** The name under which macOS keeps the per-user temporary folder, whatever `TMPDIR` says. */
const USER_TEMP_DIR_NAME = 'DARWIN_USER_TEMP_DIR';

export async function loadEnvironment(): Promise<Result<Environment, EnvironmentFailure>> {
  if (process.platform !== 'darwin') {
    return {
      kind: 'failed',
      failure: { reason: 'unsupportedPlatform', platform: process.platform },
    };
  }

  const homeDir = homedir();
  const applicationDirs = ['/Applications', join(homeDir, 'Applications')];

  const homeRealPath = await loadRealPath({ path: homeDir });

  if (homeRealPath.kind === 'failed') {
    return homeRealPath;
  }

  const homeOwnerId = await loadOwnerId({ path: homeRealPath.value });

  if (homeOwnerId.kind === 'failed') {
    return homeOwnerId;
  }

  // Read from the system, not from `TMPDIR`: every child of this folder may count as temporary.
  const tempDir = await loadUserTempDir();

  if (tempDir.kind === 'failed') {
    return tempDir;
  }

  const tempRealPath = await loadRealPath({ path: tempDir.value });

  if (tempRealPath.kind === 'failed') {
    return tempRealPath;
  }

  // Without an id, as on no Mac, the check refuses as for root.
  const userId = process.geteuid?.() ?? 0;
  const rootsFailure = checkEnvironmentRoots({
    userId: userId,
    homeRealPath: homeRealPath.value,
    homeOwnerId: homeOwnerId.value,
    tempRealPath: tempRealPath.value,
  });

  if (rootsFailure !== null) {
    return { kind: 'failed', failure: rootsFailure };
  }

  const applicationRealPaths = await loadExistingRealPaths({ paths: applicationDirs });

  return {
    kind: 'succeeded',
    value: buildEnvironment({
      platform: process.platform,
      nowMs: Date.now(),
      userId: userId,
      homeDir: homeDir,
      homeRealPath: homeRealPath.value,
      tempDir: tempDir.value,
      tempRealPath: tempRealPath.value,
      applicationDirs: applicationDirs,
      applicationRealPaths: applicationRealPaths,
    }),
  };
}

async function loadUserTempDir(): Promise<Result<string, EnvironmentFailure>> {
  const output = await loadCommandOutput({
    command: 'getconf',
    args: [USER_TEMP_DIR_NAME],
    timeoutMs: SCAN_LIMITS.commandTimeoutMs,
  });

  if (output.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: USER_TEMP_DIR_NAME, code: output.failure.reason },
    };
  }

  // Printed with a trailing slash, which would end up in every temporary path shown.
  const tempDir = output.value.trim().replace(/\/+$/, '');

  if (!isAbsolute(tempDir)) {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: USER_TEMP_DIR_NAME, code: 'notAbsolute' },
    };
  }

  return { kind: 'succeeded', value: tempDir };
}

async function loadRealPath(params: { path: string }): Promise<Result<string, EnvironmentFailure>> {
  try {
    return { kind: 'succeeded', value: await realpath(params.path) };
  } catch (error) {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.path, code: getErrorCode(error) },
    };
  }
}

async function loadOwnerId(params: { path: string }): Promise<Result<number, EnvironmentFailure>> {
  try {
    return { kind: 'succeeded', value: (await stat(params.path)).uid };
  } catch (error) {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.path, code: getErrorCode(error) },
    };
  }
}

async function loadExistingRealPaths(params: { paths: string[] }): Promise<string[]> {
  const realPaths: string[] = [];

  for (const path of params.paths) {
    const result = await loadRealPath({ path: path });

    if (result.kind === 'succeeded') {
      realPaths.push(result.value);
    }
  }

  return realPaths;
}
