import { posix, win32 } from 'node:path';
import type { Result } from '../result.js';
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
      getNameSeparatorPattern(params.rules).test(name)
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

/**
 * The path `text` names from `basePath`, as the platform's rules resolve it and never the host's:
 * a relative text below the base, an absolute one as it is. Fails as `parseAbsolutePath` does.
 */
export function resolveAbsolutePath(params: {
  rules: PathRules;
  basePath: AbsolutePath;
  text: string;
}): Result<AbsolutePath, 'not an absolute path'> {
  return parseAbsolutePath({
    rules: params.rules,
    text: resolveUnderRules({ rules: params.rules, basePath: params.basePath, text: params.text }),
  });
}

/**
 * The names of `path` in order, each between two separators of `rules` (on Windows either `\` or
 * `/`), without the empty ones a leading, doubled, or trailing separator leaves.
 */
export function listPathNames(params: { rules: PathRules; path: string }): string[] {
  return params.path.split(getNameSeparatorPattern(params.rules)).filter((name) => name !== '');
}

/** What separates two names of a path: Windows takes `/` as well as its own `\`. */
function getNameSeparatorPattern(rules: PathRules): RegExp {
  switch (rules.rootForm) {
    case 'posix':
      return /\//;
    case 'win32':
      return /[\\/]/;
  }
}

function resolveUnderRules(params: {
  rules: PathRules;
  basePath: AbsolutePath;
  text: string;
}): string {
  switch (params.rules.rootForm) {
    case 'posix':
      return posix.resolve(params.basePath, params.text);
    case 'win32':
      return win32.resolve(params.basePath, params.text);
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
