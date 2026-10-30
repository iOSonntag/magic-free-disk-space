import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { Result } from '../result.js';
import { getErrorCode } from './getErrorCode.js';
import type { FileFailure } from './loadFileIdentity.js';
import { getFileFailure } from './loadFileIdentity.js';
import { runFilesystemCall } from './runFilesystemCall.js';

export type FileContentFailureNotFile = { reason: 'notFile' };

export type FileContentFailureTooLarge = { reason: 'tooLarge'; maxBytes: number };

/** Why the content of a file was not read: the entry, its kind, or its size. */
export type FileContentFailure =
  | FileFailure
  | FileContentFailureNotFile
  | FileContentFailureTooLarge;

export type FileBytesResult = Result<Uint8Array, FileContentFailure>;

/** The bytes of the regular file, at most `maxBytes` of them. Never blocks on a FIFO. */
export async function loadFileBytes(params: {
  path: string;
  maxBytes: number;
}): Promise<FileBytesResult> {
  try {
    return await runFilesystemCall(() => readBoundedFile(params));
  } catch (error) {
    return { kind: 'failed', failure: getFileFailure({ code: getErrorCode(error) }) };
  }
}

async function readBoundedFile(params: {
  path: string;
  maxBytes: number;
}): Promise<FileBytesResult> {
  const handle = await open(params.path, constants.O_RDONLY | constants.O_NONBLOCK);

  try {
    const stats = await handle.stat();

    if (!stats.isFile()) {
      return { kind: 'failed', failure: { reason: 'notFile' } };
    }

    if (stats.size > params.maxBytes) {
      return { kind: 'failed', failure: { reason: 'tooLarge', maxBytes: params.maxBytes } };
    }

    const bytes = await handle.readFile();

    // The file may grow between the stat and the read.
    if (bytes.length > params.maxBytes) {
      return { kind: 'failed', failure: { reason: 'tooLarge', maxBytes: params.maxBytes } };
    }

    return { kind: 'succeeded', value: bytes };
  } finally {
    await handle.close();
  }
}
