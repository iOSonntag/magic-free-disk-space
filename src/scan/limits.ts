export const DAY_MS = 86_400_000;

export const SCAN_LIMITS = {
  commandTimeoutMs: 10_000,
  measureTimeoutMs: 180_000,
  probeMaxEntries: 5_000,
  probeTimeoutMs: 20_000,
  walkTimeoutMs: 120_000,
  projectMaxDepth: 8,
  minOfferedBytes: 1_048_576,
  minAppBytes: 268_435_456,
  minUserFileBytes: 104_857_600,
  defaultStaleDays: 10,
  defaultUnusedDays: 180,
};

/** Top-level home folders that the project search never enters. */
export const PROJECT_SEARCH_EXCLUDED_NAMES: string[] = [
  '.Trash',
  'Applications',
  'Library',
  'Movies',
  'Music',
  'Pictures',
  'Public',
];

/** Home folders searched for large files that the user may no longer need. */
export const USER_FILE_ROOT_RELATIVE_PATHS: string[] = [
  'Desktop',
  'Documents',
  'Downloads',
  'Movies',
];
