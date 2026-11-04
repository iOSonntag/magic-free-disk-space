/** Root-like folders, relative to the home folder. They may never be removed as a whole. */
export const PROTECTED_HOME_RELATIVE_PATHS: string[] = [
  '',
  '.cache',
  '.Trash',
  'Applications',
  'Desktop',
  'Documents',
  'Downloads',
  'Movies',
  'Music',
  'Pictures',
  'go',
  'Library',
  'Library/Application Support',
  'Library/Caches',
  'Library/Containers',
  'Library/Developer',
  'Library/Group Containers',
  'Library/Mobile Documents',
  'Library/Preferences',
];

/**
 * Folders relative to the home folder that are never removed, neither whole nor in part. The
 * folders of the deletion log and of the preference file join them in the environment.
 */
export const SENSITIVE_HOME_RELATIVE_PATHS: string[] = ['.ssh', '.gnupg', 'Library/Keychains'];
