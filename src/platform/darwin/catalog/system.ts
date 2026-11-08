import type { CatalogEntry } from '../../../catalog/catalog.js';

/** macOS itself, such as its downloaded updates. */
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
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'advice',
      carvedPaths: [],
      opener: null,
      advice:
        'Downloaded macOS updates. Install or cancel the pending update in System Settings > General > Software Update; macOS removes the files afterwards.',
    },
  },
];
