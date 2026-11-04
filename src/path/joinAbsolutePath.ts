import { posix, win32 } from 'node:path';
import type { AbsolutePath } from './parseAbsolutePath.js';
import { parseAbsolutePath } from './parseAbsolutePath.js';
import type { PathRules } from './pathRules.js';

/**
 * The path of `names` below `parentPath`, one folder level per name. Throws for a name that is
 * empty, `.`, or `..`, or holds a separator of `rules` (on Windows either `\` or `/`), since such a
 * name is no entry of its parent.
 */
export function joinAbsolutePath(params: {
  rules: PathRules;
  parentPath: AbsolutePath;
  names: string[];
}): AbsolutePath {
  for (const name of params.names) {
    if (
      name === '' ||
      name === '.' ||
      name === '..' ||
      holdsSeparator({ rules: params.rules, name: name })
    ) {
      throw new Error(`"${name}" is no entry name to join below a folder.`);
    }
  }

  const path = parseAbsolutePath({
    rules: params.rules,
    text: joinUnderRules({
      rules: params.rules,
      parentPath: params.parentPath,
      names: params.names,
    }),
  });

  if (path.kind === 'failed') {
    throw new Error('A path joined below an absolute path is not absolute.');
  }

  return path.value;
}

function holdsSeparator(params: { rules: PathRules; name: string }): boolean {
  switch (params.rules.rootForm) {
    case 'posix':
      return params.name.includes(params.rules.separator);
    case 'win32':
      return params.name.includes(params.rules.separator) || params.name.includes('/');
  }
}

function joinUnderRules(params: {
  rules: PathRules;
  parentPath: AbsolutePath;
  names: string[];
}): string {
  switch (params.rules.rootForm) {
    case 'posix':
      return posix.join(params.parentPath, ...params.names);
    case 'win32':
      return win32.join(params.parentPath, ...params.names);
  }
}
