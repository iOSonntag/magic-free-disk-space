import type { EnvironmentLocation } from '../../environment/environmentLocation.js';
import { buildHomeLocation } from './buildHomeLocation.js';

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
export const userFileRoots: EnvironmentLocation[] = [
  'Desktop',
  'Documents',
  'Downloads',
  'Movies',
].map((name) => buildHomeLocation({ names: [name] }));
