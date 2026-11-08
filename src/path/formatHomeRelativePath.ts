import { isSameOrInsidePath, isSamePath } from './isSameOrInsidePath.js';
import type { PathRules } from './pathRules.js';

/**
 * Shows a path inside the home folder as `~` and its rest below it, joined by the separator of
 * `rules` and in the path's own case; any other path stays as it is.
 */
export function formatHomeRelativePath(params: {
  rules: PathRules;
  path: string;
  homeDir: string;
}): string {
  if (isSamePath({ rules: params.rules, path: params.path, otherPath: params.homeDir })) {
    return '~';
  }

  if (!isSameOrInsidePath({ rules: params.rules, path: params.path, parentPath: params.homeDir })) {
    return params.path;
  }

  const homePrefixLength = params.homeDir.endsWith(params.rules.separator)
    ? params.homeDir.length
    : params.homeDir.length + params.rules.separator.length;

  return `~${params.rules.separator}${params.path.slice(homePrefixLength)}`;
}
