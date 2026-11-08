import type { EnvironmentLocation } from '../../environment/environmentLocation.js';

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
export const USER_FILE_ROOTS: EnvironmentLocation[] = [
  'Desktop',
  'Documents',
  'Downloads',
  'Movies',
].map((name) => ({ root: 'home', path: name }));
