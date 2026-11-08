import { isSameOrInsidePath } from './isSameOrInsidePath.js';
import type { PathRules } from './pathRules.js';

/**
 * True when `path` equals `otherPath`, holds it or lies in it, by whole segments as
 * `isSameOrInsidePath` compares them. Both paths must be absolute and normalized.
 */
export function isOverlappingPath(params: {
  rules: PathRules;
  path: string;
  otherPath: string;
}): boolean {
  return (
    isSameOrInsidePath({ rules: params.rules, path: params.path, parentPath: params.otherPath }) ||
    isSameOrInsidePath({ rules: params.rules, path: params.otherPath, parentPath: params.path })
  );
}
