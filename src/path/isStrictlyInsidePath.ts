import { isSameOrInsidePath, isSamePath } from './isSameOrInsidePath.js';
import type { PathRules } from './pathRules.js';

/**
 * True when `path` lies below `parentPath` and is not the same path, by whole segments as
 * `isSameOrInsidePath` compares them, so on Windows a path differing only by case is the same.
 * Both paths must be absolute and normalized.
 */
export function isStrictlyInsidePath(params: {
  rules: PathRules;
  path: string;
  parentPath: string;
}): boolean {
  return (
    isSameOrInsidePath({ rules: params.rules, path: params.path, parentPath: params.parentPath }) &&
    !isSamePath({ rules: params.rules, path: params.path, otherPath: params.parentPath })
  );
}
