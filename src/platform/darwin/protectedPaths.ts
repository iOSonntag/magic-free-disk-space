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
];
