import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { runFilesystemCall } from './runFilesystemCall.js';

/**
 * The bytes of the regular file; `null` when it is missing, cannot be read, is no regular file, or
 * holds more than `maxBytes`. Never blocks on a FIFO.
 */
export async function loadFileBytes(params: {
  path: string;
  maxBytes: number;
}): Promise<Uint8Array | null> {
  try {
    return await runFilesystemCall(() => readBoundedFile(params));
  } catch {
    return null;
  }
}

async function readBoundedFile(params: {
  path: string;
  maxBytes: number;
}): Promise<Uint8Array | null> {
  const handle = await open(params.path, constants.O_RDONLY | constants.O_NONBLOCK);

  try {
    const stats = await handle.stat();

    if (!stats.isFile() || stats.size > params.maxBytes) {
      return null;
    }

    const bytes = await handle.readFile();

    if (bytes.length > params.maxBytes) {
      return null;
    }

    return bytes;
  } finally {
    await handle.close();
  }
}
