/**
 * Root-like folders below the home folder, one name per level; the empty list is the home folder
 * itself. They may never be removed as a whole.
 */
export const PROTECTED_HOME_DIR_NAMES: string[][] = [
  [],
  ['.cache'],
  ['.Trash'],
  ['Applications'],
  ['Desktop'],
  ['Documents'],
  ['Downloads'],
  ['Movies'],
  ['Music'],
  ['Pictures'],
  ['go'],
  ['Library'],
  ['Library', 'Application Support'],
  ['Library', 'Caches'],
  ['Library', 'Containers'],
  ['Library', 'Developer'],
  ['Library', 'Group Containers'],
  ['Library', 'Mobile Documents'],
  ['Library', 'Preferences'],
];

/**
 * Folders below the home folder that are never removed, neither whole nor in part, one name per
 * level. The folders of the deletion log and of the preference file join them in the environment.
 */
export const SENSITIVE_HOME_DIR_NAMES: string[][] = [
  ['.ssh'],
  ['.gnupg'],
  ['Library', 'Keychains'],
  // These may hold the only copy of mail, chats, photos and phones; only their own apps free them.
  ['Library', 'Mail'],
  ['Library', 'Messages'],
  ['Pictures', 'Photos Library.photoslibrary'],
  ['Library', 'Application Support', 'MobileSync'],
];

/**
 * Folders inside a sensitive folder that may still go, whole and in part, one name per level:
 * caches that their app makes again, such as the previews of Messages.
 */
export const SENSITIVE_EXCEPTION_HOME_DIR_NAMES: string[][] = [
  ['Library', 'Messages', 'Caches', 'Previews', 'Attachments'],
  ['Library', 'Messages', 'Caches', 'Previews', 'StickerCache'],
  ['Library', 'Messages', 'StickerCache'],
];
