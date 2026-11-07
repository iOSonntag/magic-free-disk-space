import type { CatalogEntry } from '../../../catalog/catalog.js';

/** iCloud Drive files kept on this Mac. */
export const ICLOUD_ENTRIES: CatalogEntry[] = [
  {
    id: 'icloud-drive-downloads',
    category: 'cloudCopies',
    title: 'Downloaded iCloud Drive files',
    explanation:
      'Files of iCloud Drive and of the apps that keep their documents in it, downloaded to this Mac and not opened or changed for the unused period. Removing the download frees the space here; iCloud Drive keeps every file.',
    regeneration: 'Downloaded again from iCloud Drive when a file is opened.',
    risk: 'review',
    root: 'home',
    path: 'Library/Mobile Documents',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'icloudDownloads',
      advice:
        'In Finder, select the iCloud Drive files you no longer need here and choose Remove Download. iCloud Drive keeps them.',
    },
  },
];
