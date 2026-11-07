import type { CatalogEntry } from '../../../catalog/catalog.js';
import { SCAN_LIMITS } from '../../../scan/limits.js';
import { buildBundleIdOwner } from './buildBundleIdOwner.js';

/** The logs and crash reports that macOS and apps write, and the small caches of macOS's apps. */
export const SYSTEM_LOG_ENTRIES: CatalogEntry[] = [
  {
    id: 'messages-attachment-previews',
    category: 'caches',
    title: 'Messages attachment previews',
    explanation:
      'Small previews of the photos and files in your chats, kept to show them faster. Your messages and attachments stay.',
    regeneration: 'Messages makes them again when you open a chat.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Messages/Caches/Previews/Attachments',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.apple.MobileSMS' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'messages-sticker-previews',
    category: 'caches',
    title: 'Messages sticker previews',
    explanation: 'Previews of the stickers in your chats, kept to show them faster.',
    regeneration: 'Messages makes them again when you open a chat.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Messages/Caches/Previews/StickerCache',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.apple.MobileSMS' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'messages-sticker-cache',
    category: 'caches',
    title: 'Messages sticker cache',
    explanation: 'Stickers that Messages keeps to show them in your chats faster.',
    regeneration: 'Messages downloads or makes them again when a chat shows them.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Messages/StickerCache',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.apple.MobileSMS' }),
    removal: { kind: 'delete' },
  },
  {
    // A running app writes to its graphics cache, so only an app folder unchanged for a day goes.
    id: 'metal-caches',
    category: 'caches',
    title: 'Old graphics caches',
    explanation:
      'Graphics code that macOS compiled for an app, kept to start its drawing faster, untouched for a day. One item for each app.',
    regeneration: 'macOS compiles it again the next time the app draws.',
    risk: 'safe',
    root: 'userCache',
    path: '',
    selection: {
      kind: 'profileFolders',
      markerName: null,
      subpaths: ['com.apple.gpuarchiver', 'com.apple.metal', 'com.apple.metalfe'],
      rootSubpaths: [],
    },
    ageRule: { kind: 'unchangedDays', days: 1 },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    // Crash reports go as one child, each too small alone; the deletion log stays protected.
    id: 'user-logs',
    category: 'caches',
    title: 'Old app logs',
    explanation:
      'Notes that apps write about what they did, and the reports of their crashes, for finding problems, untouched for a while. One folder for each app, and one for the crash reports.',
    regeneration: 'Apps write new ones while they run.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Logs',
    selection: { kind: 'children' },
    ageRule: { kind: 'unchangedDays', days: SCAN_LIMITS.defaultStaleDays },
    owner: null,
    removal: { kind: 'delete' },
  },
];
