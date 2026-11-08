import type { CatalogEntry } from '../../../catalog/catalog.js';
import { SCAN_LIMITS } from '../../../scan/limits.js';

/**
 * The broad folders that offer each child no narrower entry claims. They join last,
 * so every other entry wins an overlap with them.
 */
export const CATCH_ALL_ENTRIES: CatalogEntry[] = [
  {
    id: 'user-caches',
    category: 'caches',
    title: 'App caches',
    explanation:
      'Files an app keeps so it works faster, one folder for each app. Quit the app first.',
    regeneration: 'The app makes them again when it needs them.',
    risk: 'review',
    root: 'home',
    path: 'Library/Caches',
    selection: { kind: 'children' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'home-caches',
    category: 'caches',
    title: 'Developer tool caches',
    explanation: 'Files a developer tool keeps so it works faster, one folder for each tool.',
    regeneration: 'The tool makes them again when it needs them.',
    risk: 'review',
    root: 'home',
    path: '.cache',
    selection: { kind: 'children' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'trash',
    category: 'trash',
    title: 'Trash',
    explanation:
      'Items you moved to the Trash. Deleting one here removes it for good, as emptying the Trash would.',
    regeneration: 'A deleted item does not come back.',
    risk: 'careful',
    root: 'home',
    path: '.Trash',
    selection: { kind: 'children' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'user-temporary-files',
    category: 'temporary',
    title: 'Temporary files',
    explanation: 'Temporary files that apps left behind and that have not changed for a while.',
    regeneration: 'Apps make new ones when they need them.',
    risk: 'safe',
    root: 'temp',
    path: '',
    selection: { kind: 'children' },
    ageRule: { kind: 'unchangedDays', days: SCAN_LIMITS.defaultStaleDays },
    owner: null,
    removal: { kind: 'delete' },
  },
];
