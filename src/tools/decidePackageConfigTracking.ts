import { parseGitIndexPaths } from './parseGitIndexPaths.js';

/**
 * Whether version control tracks a project's `package_config.json`; `unknown` when the index
 * cannot tell, and for a project with no repository or under another version control.
 */
export type PackageConfigTracking = 'tracked' | 'untracked' | 'unknown';

export const PACKAGE_CONFIG_FILE_NAME = 'package_config.json';

const defaultIgnorableCodePoints = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * Whether an entry of the git index `indexBytes` names `packageConfigPath`, relative to the work
 * tree with `/` between its segments, compared after ignorable code points are removed, NFKC, and
 * lowercasing; `unknown` when `parseGitIndexPaths` cannot read the index.
 */
export function decidePackageConfigTracking(params: {
  indexBytes: Uint8Array;
  packageConfigPath: string;
}): PackageConfigTracking {
  const indexPaths = parseGitIndexPaths(params.indexBytes);

  if (indexPaths === null) {
    return 'unknown';
  }

  const foldedPackageConfigPath = foldPathVariants(params.packageConfigPath);
  const tracked = indexPaths.some(
    (indexPath) => foldPathVariants(indexPath) === foldedPackageConfigPath,
  );

  if (tracked) {
    return 'tracked';
  }

  return 'untracked';
}

/** Folds the variants of a path that a volume ignoring case or normalization maps to one file. */
function foldPathVariants(path: string): string {
  return path.replace(defaultIgnorableCodePoints, '').normalize('NFKC').toLowerCase();
}
