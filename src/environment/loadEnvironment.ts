import { realpath } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Result } from '../result.js';
import { getErrorCode } from '../system/getErrorCode.js';
import type { Environment } from './buildEnvironment.js';
import { buildEnvironment } from './buildEnvironment.js';

export type EnvironmentFailure = {
  reason: 'unresolvable';
  path: string;
  code: string;
};

export async function loadEnvironment(): Promise<Result<Environment, EnvironmentFailure>> {
  const homeDir = homedir();
  const tempDir = tmpdir();
  const applicationDirs = ['/Applications', join(homeDir, 'Applications')];

  const homeRealPath = await loadRealPath({ path: homeDir });

  if (homeRealPath.kind === 'failed') {
    return homeRealPath;
  }

  const tempRealPath = await loadRealPath({ path: tempDir });

  if (tempRealPath.kind === 'failed') {
    return tempRealPath;
  }

  const applicationRealPaths = await loadExistingRealPaths({ paths: applicationDirs });

  return {
    kind: 'succeeded',
    value: buildEnvironment({
      platform: process.platform,
      nowMs: Date.now(),
      homeDir: homeDir,
      homeRealPath: homeRealPath.value,
      tempDir: tempDir,
      tempRealPath: tempRealPath.value,
      applicationDirs: applicationDirs,
      applicationRealPaths: applicationRealPaths,
    }),
  };
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
