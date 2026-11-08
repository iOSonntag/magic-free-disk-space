import type { MakeDirectoryOptions } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { Result } from '../result.js';
import { getErrorCode } from './getErrorCode.js';

type DirectoryCreateFailure = { code: string };

/**
 * Creates the folder and every missing parent with the directory mode of `ownerOnlyModes`, or with
 * the system's default for `null`; a folder already there is a success. Never throws.
 */
export async function createDirectory(params: {
  path: string;
  ownerOnlyModes: { directoryMode: number } | null;
}): Promise<Result<null, DirectoryCreateFailure>> {
  const options: MakeDirectoryOptions & { recursive: true } = { recursive: true };

  if (params.ownerOnlyModes !== null) {
    options.mode = params.ownerOnlyModes.directoryMode;
  }

  try {
    await mkdir(params.path, options);

    return { kind: 'succeeded', value: null };
  } catch (error) {
    return { kind: 'failed', failure: { code: getErrorCode(error) } };
  }
}
