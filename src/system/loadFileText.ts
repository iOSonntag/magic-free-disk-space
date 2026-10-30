import type { Result } from '../result.js';
import type { FileContentFailure } from './loadFileBytes.js';
import { loadFileBytes } from './loadFileBytes.js';

export type FileTextResult = Result<string, FileContentFailure>;

/**
 * The UTF-8 text of the regular file, read through `loadFileBytes` with its bound, so a denied read
 * is never taken for a missing file.
 */
export async function loadFileText(params: {
  path: string;
  maxBytes: number;
}): Promise<FileTextResult> {
  const bytes = await loadFileBytes(params);

  if (bytes.kind === 'failed') {
    return bytes;
  }

  return { kind: 'succeeded', value: new TextDecoder().decode(bytes.value) };
}
