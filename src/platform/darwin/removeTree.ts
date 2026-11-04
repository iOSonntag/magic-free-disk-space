import { rm } from 'node:fs/promises';
import type { Result } from '../../result.js';
import { getErrorCode } from '../../system/getErrorCode.js';

/** Removes the path recursively; a symbolic link inside is removed itself, never its target. */
export async function removeTree(params: { path: string }): Promise<Result<null, string>> {
  try {
    await rm(params.path, { recursive: true });

    return { kind: 'succeeded', value: null };
  } catch (error) {
    return { kind: 'failed', failure: getErrorCode(error) };
  }
}
