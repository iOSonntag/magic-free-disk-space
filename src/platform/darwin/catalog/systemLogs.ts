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
    // The GPU caches macOS keeps for each app, one folder per app in the user cache folder, as
    // Mole cleans them (tw93/Mole `lib/clean/system.sh`, lines 9-28). Mole takes one only when
    // nothing in it changed for a day, so a running app keeps the cache it uses (lines 30-51); the
    // age rule here judges the whole folder of the app, which is at least as strict.
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
    id: 'crash-reports',
    category: 'caches',
    title: 'Old crash reports',
    explanation: 'Reports that apps and macOS wrote when something crashed, untouched for a while.',
    regeneration: 'New reports appear only if something crashes again.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Logs/DiagnosticReports',
    selection: { kind: 'children' },
    ageRule: { kind: 'unchangedDays', days: SCAN_LIMITS.defaultStaleDays },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    // This app's deletion log, a child of this folder, is never offered: the scan skips each
    // offer that touches a protected path.
    id: 'user-logs',
    category: 'caches',
    title: 'Old app logs',
    explanation:
      'Notes that apps write about what they did, for finding problems, untouched for a while. One folder for each app.',
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
