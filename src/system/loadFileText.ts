import { readFile } from 'node:fs/promises';
import { runFilesystemCall } from './runFilesystemCall.js';

/** The UTF-8 text of the file; `null` when it is missing or cannot be read. */
export async function loadFileText(params: { path: string }): Promise<string | null> {
  try {
    return await runFilesystemCall(() => readFile(params.path, 'utf8'));
  } catch {
    return null;
  }
}
