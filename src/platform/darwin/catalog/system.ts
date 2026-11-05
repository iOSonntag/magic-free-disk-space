import type { CatalogEntry } from '../../../catalog/catalog.js';

/** macOS itself: its downloaded updates and the device backups it keeps. */
export const SYSTEM_ENTRIES: CatalogEntry[] = [
  {
    id: 'macos-update-downloads',
    category: 'system',
    title: 'macOS update downloads',
    explanation:
      'macOS updates that are downloaded but not yet installed. Install or cancel them in System Settings > General > Software Update.',
    regeneration: 'macOS downloads the update again when you check for updates.',
    risk: 'careful',
    root: 'absolute',
    path: '/Library/Updates',
    scope: 'self',
    ageRule: 'none',
    owner: null,
    removal: {
      kind: 'advice',
      advice:
        'Downloaded macOS updates. Install or cancel the pending update in System Settings > General > Software Update; macOS removes the files afterwards.',
    },
  },
  {
    id: 'iphone-backups',
    category: 'system',
    title: 'iPhone and iPad backups',
    explanation:
      'Backups of your iPhones and iPads, which may be the only copy of their data. Manage them in Finder.',
    regeneration: 'A deleted backup does not come back.',
    risk: 'never',
    root: 'home',
    path: 'Library/Application Support/MobileSync/Backup',
    scope: 'self',
    ageRule: 'none',
    owner: null,
    removal: {
      kind: 'advice',
      advice:
        'Backups of iPhones and iPads may be the only copy of their data. Manage them in Finder: select the device, then Manage Backups.',
    },
  },
];
