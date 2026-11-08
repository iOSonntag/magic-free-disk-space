import { loadRealPathResult } from './loadFileIdentity.js';

/**
 * The path with every link resolved; `null` when nothing is there, a link dangles, or the path
 * cannot be read.
 */
export async function loadRealPath(params: { path: string }): Promise<string | null> {
  const realPath = await loadRealPathResult({ path: params.path });

  return realPath.kind === 'succeeded' ? realPath.value : null;
}
