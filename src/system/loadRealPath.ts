import { realpath } from 'node:fs/promises';
import { runFilesystemCall } from './runFilesystemCall.js';

/**
 * The path with every link resolved; `null` when nothing is there, a link dangles, or the path
 * cannot be read.
 */
export async function loadRealPath(params: { path: string }): Promise<string | null> {
  try {
    return await runFilesystemCall(() => realpath(params.path));
  } catch {
    return null;
  }
}
