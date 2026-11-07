import { isSameOrInsidePath } from './isSameOrInsidePath.js';
import type { PathRules } from './pathRules.js';

/**
 * True when `path` lies below `parentPath` and is not the same text, by whole segments as
 * `isSameOrInsidePath` compares them. Both paths must be absolute and normalized.
 */
export function isStrictlyInsidePath(params: {
  rules: PathRules;
  path: string;
  parentPath: string;
}): boolean {
  return (
    params.path !== params.parentPath &&
    isSameOrInsidePath({ rules: params.rules, path: params.path, parentPath: params.parentPath })
  );
}
