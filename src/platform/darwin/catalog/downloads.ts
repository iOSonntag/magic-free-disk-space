import type { CatalogEntry } from '../../../catalog/catalog.js';
import { DOWNLOADS_ROOT_PATH_NAMES } from '../appleDataRoots.js';

/** The Downloads folder and the installers left in it. */
export const DOWNLOAD_ENTRIES: CatalogEntry[] = [
  {
    id: 'downloads-installers',
    category: 'downloads',
    title: 'Old installers and unfinished downloads',
    explanation:
      'Disk images, installer packages, and partial downloads at the top of Downloads that nothing changed for the stale period.',
    regeneration: 'Download it again from its maker, or start the download again in the browser.',
    risk: 'careful',
    root: 'home',
    path: DOWNLOADS_ROOT_PATH_NAMES.join('/'),
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'downloadsInstallers',
      advice:
        'Open Downloads in Finder, sort by kind, and delete the disk images, packages, and unfinished downloads of apps you installed long ago.',
    },
  },
  {
    id: 'iphone-software-updates',
    category: 'installers',
    title: 'iPhone system downloads',
    explanation:
      'The iOS versions Finder downloaded to update or restore an iPhone. Once the iPhone runs it, the download is no longer needed.',
    regeneration: 'Finder downloads it again when it updates or restores an iPhone.',
    risk: 'review',
    root: 'home',
    path: 'Library/iTunes/iPhone Software Updates',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'ipad-software-updates',
    category: 'installers',
    title: 'iPad system downloads',
    explanation:
      'The iPadOS versions Finder downloaded to update or restore an iPad. Once the iPad runs it, the download is no longer needed.',
    regeneration: 'Finder downloads it again when it updates or restores an iPad.',
    risk: 'review',
    root: 'home',
    path: 'Library/iTunes/iPad Software Updates',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
];
