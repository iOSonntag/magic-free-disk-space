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

/** Folder of the deletion log, relative to the home folder. */
export const DELETION_LOG_HOME_RELATIVE_DIR = 'Library/Logs/magic-free-disk-space';

/** Folders relative to the home folder that are never removed, neither whole nor in part. */
export const SENSITIVE_HOME_RELATIVE_PATHS: string[] = [
  '.ssh',
  '.gnupg',
  'Library/Keychains',
  DELETION_LOG_HOME_RELATIVE_DIR,
];
