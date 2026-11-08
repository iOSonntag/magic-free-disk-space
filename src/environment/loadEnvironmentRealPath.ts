import { realpath } from 'node:fs/promises';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { Result } from '../result.js';
import { getErrorCode } from '../system/getErrorCode.js';
import type { EnvironmentFailure } from './environmentPlatform.js';

/**
 * The real path of the folder at `path`; unresolvable at `path` when it cannot be read or its real
 * path is not absolute under `pathRules`, as a network share is no drive path of Windows.
 */
export async function loadEnvironmentRealPath(params: {
  pathRules: PathRules;
  path: AbsolutePath;
}): Promise<Result<AbsolutePath, EnvironmentFailure>> {
  const realPathText = await loadRealPathText({ path: params.path });

  if (realPathText.kind === 'failed') {
    return realPathText;
  }

  const realPath = parseAbsolutePath({ rules: params.pathRules, text: realPathText.value });

  if (realPath.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.path, code: 'notAbsolute' },
    };
  }

  return { kind: 'succeeded', value: realPath.value };
}

/** The real path of each of `paths` that `loadEnvironmentRealPath` resolves, in their order. */
export async function loadExistingRealPaths(params: {
  pathRules: PathRules;
  paths: AbsolutePath[];
}): Promise<AbsolutePath[]> {
  const realPaths: AbsolutePath[] = [];

  for (const path of params.paths) {
    const result = await loadEnvironmentRealPath({ pathRules: params.pathRules, path: path });

    if (result.kind === 'succeeded') {
      realPaths.push(result.value);
    }
  }

  return realPaths;
}

async function loadRealPathText(params: {
  path: AbsolutePath;
}): Promise<Result<string, EnvironmentFailure>> {
  try {
    return { kind: 'succeeded', value: await realpath(params.path) };
  } catch (error) {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.path, code: getErrorCode(error) },
    };
  }
}
