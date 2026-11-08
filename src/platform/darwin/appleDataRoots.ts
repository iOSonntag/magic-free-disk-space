import type { HomeRelativePathNames } from '../../explore/explorePlatform.js';

/** The folder browsers download into. */
export const DOWNLOADS_ROOT_PATH_NAMES: HomeRelativePathNames = ['Downloads'];

/**
 * iCloud Drive's local folder on macOS: one folder per app that syncs there, and
 * `com~apple~CloudDocs` for the files the person keeps in iCloud Drive. Only an evict may take a
 * file off this Mac here; a delete would delete it on every device.
 */
export const ICLOUD_DRIVE_ROOT_PATH_NAMES: HomeRelativePathNames = ['Library', 'Mobile Documents'];

/**
 * The copies of the attachments Mail opened, one folder per message; the path of the catalog's
 * `mail-downloads` entry.
 */
export const MAIL_DOWNLOADS_ROOT_PATH_NAMES: HomeRelativePathNames = [
  'Library',
  'Containers',
  'com.apple.mail',
  'Data',
  'Library',
  'Mail Downloads',
];
