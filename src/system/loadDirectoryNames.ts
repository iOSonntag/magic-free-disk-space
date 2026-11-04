import { readdir } from 'node:fs/promises';
import type { Result } from '../result.js';
import { getErrorCode } from './getErrorCode.js';
import { runFilesystemCall } from './runFilesystemCall.js';

/** `inUse`: another program holds the folder open, which only Windows refuses a read for. */
export type DirectoryFailure = {
  reason: 'missing' | 'permissionDenied' | 'inUse' | 'notDirectory' | 'unexpected';
  code: string;
};

const PERMISSION_DENIED_CODES = ['EACCES', 'EPERM'];

const IN_USE_CODE = 'EBUSY';

export async function loadDirectoryNames(params: {
  path: string;
}): Promise<Result<string[], DirectoryFailure>> {
  try {
    const names = await runFilesystemCall(() => readdir(params.path));

    return { kind: 'succeeded', value: names.toSorted() };
  } catch (error) {
    return { kind: 'failed', failure: getDirectoryFailure({ code: getErrorCode(error) }) };
  }
}

export function getDirectoryFailure(params: { code: string }): DirectoryFailure {
  if (params.code === 'ENOENT') {
    return { reason: 'missing', code: params.code };
  }

  if (params.code === 'ENOTDIR') {
    return { reason: 'notDirectory', code: params.code };
  }

  if (PERMISSION_DENIED_CODES.includes(params.code)) {
    return { reason: 'permissionDenied', code: params.code };
  }

  if (params.code === IN_USE_CODE) {
    return { reason: 'inUse', code: params.code };
  }

  return { reason: 'unexpected', code: params.code };
}
