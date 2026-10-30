import { join } from 'node:path';
import type { AbsolutePath } from './parseAbsolutePath.js';
import { parseAbsolutePath } from './parseAbsolutePath.js';

/**
 * The path of `names` below `parentPath`, one folder level per name. Throws for a name that is
 * empty, `.`, or `..`, or holds a slash, since such a name is no entry of its parent.
 */
export function joinAbsolutePath(params: {
  parentPath: AbsolutePath;
  names: string[];
}): AbsolutePath {
  for (const name of params.names) {
    if (name === '' || name === '.' || name === '..' || name.includes('/')) {
      throw new Error(`"${name}" is no entry name to join below a folder.`);
    }
  }

  const path = parseAbsolutePath({ text: join(params.parentPath, ...params.names) });

  if (path.kind === 'failed') {
    throw new Error('A path joined below an absolute path is not absolute.');
  }

  return path.value;
}
