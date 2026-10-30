import type { EntryStatsResult } from '../system/loadEntryStats.js';

/**
 * Whether version control tracks a project's `package_config.json`; `unknown` when the index
 * cannot tell, and for a project with no repository or under another version control.
 */
export type PackageConfigTracking = 'tracked' | 'untracked' | 'unknown';

export const PACKAGE_CONFIG_FILE_NAME = 'package_config.json';

/** Bounds the entries statted, so a crafted index cannot make the scan stat without bound. */
export const PACKAGE_CONFIG_CANDIDATES_MAX_COUNT = 64;

const defaultIgnorableCodePoints = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * The entries of `indexPaths` whose last segment may name a `package_config.json` on a volume that
 * ignores case or normalization; `null` for more than `PACKAGE_CONFIG_CANDIDATES_MAX_COUNT`. The
 * fold also joins a few names a volume keeps apart, such as `ı` and `i`, so it only finds
 * candidates and never decides that an entry is the project's config.
 */
export function findPackageConfigCandidatePaths(params: { indexPaths: string[] }): string[] | null {
  const candidatePaths = params.indexPaths.filter(
    (indexPath) =>
      foldNameVariants(indexPath.slice(indexPath.lastIndexOf('/') + 1)) ===
      PACKAGE_CONFIG_FILE_NAME,
  );

  if (candidatePaths.length > PACKAGE_CONFIG_CANDIDATES_MAX_COUNT) {
    return null;
  }

  return candidatePaths;
}

/**
 * `tracked` when a candidate entry is the same file as the project's config, by `dev` and `ino`;
 * `unknown` when the config's stats failed or, with no candidate the same file, a candidate's stats
 * failed for a reason other than `missing`; else `untracked`.
 */
export function decidePackageConfigTracking(params: {
  packageConfigStats: EntryStatsResult;
  candidateStats: EntryStatsResult[];
}): PackageConfigTracking {
  const packageConfigStats = params.packageConfigStats;

  if (packageConfigStats.kind === 'failed') {
    return 'unknown';
  }

  const tracked = params.candidateStats.some(
    (candidateStats) =>
      candidateStats.kind === 'succeeded' &&
      candidateStats.value.dev === packageConfigStats.value.dev &&
      candidateStats.value.ino === packageConfigStats.value.ino,
  );

  if (tracked) {
    return 'tracked';
  }

  const unreadable = params.candidateStats.some(
    (candidateStats) =>
      candidateStats.kind === 'failed' && candidateStats.failure.reason !== 'missing',
  );

  if (unreadable) {
    return 'unknown';
  }

  return 'untracked';
}

/**
 * Folds the variants of a name that a volume ignoring case or normalization may map to one file:
 * ignorable code points removed, NFKC, and a round trip through upper case, such as `ß` to `ss`.
 */
function foldNameVariants(name: string): string {
  return name
    .replace(defaultIgnorableCodePoints, '')
    .normalize('NFKC')
    .toLowerCase()
    .toUpperCase()
    .toLowerCase()
    .normalize('NFKC');
}
