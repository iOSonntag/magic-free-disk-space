import type { PathRules } from './pathRules.js';

/**
 * True when `path` equals `parentPath` or lies below it, comparing whole path segments split by
 * the separator of `rules`, so `/a/bc` is not inside `/a/b`. Both paths must be absolute and
 * normalized.
 */
export function isSameOrInsidePath(params: {
  rules: PathRules;
  path: string;
  parentPath: string;
}): boolean {
  if (params.path === params.parentPath) {
    return true;
  }

  const parentPrefix = params.parentPath.endsWith(params.rules.separator)
    ? params.parentPath
    : `${params.parentPath}${params.rules.separator}`;

  return params.path.startsWith(parentPrefix);
}
