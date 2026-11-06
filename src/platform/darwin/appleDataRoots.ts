import type { HomeRelativePathNames } from '../../explore/explorePlatform.js';
import { stubPartNotBuilt } from '../../notBuilt.js';

/** iCloud Drive's local folder on macOS. Part 3b settles it; until then no probe reads it. */
export const ICLOUD_DRIVE_ROOT_PATH_NAMES = stubPartNotBuilt<HomeRelativePathNames>([
  'Library',
  'Mobile Documents',
]);

/** Mail's folder of saved attachments on macOS. Part 3b settles it; until then no probe reads it. */
export const MAIL_DOWNLOADS_ROOT_PATH_NAMES = stubPartNotBuilt<HomeRelativePathNames>([
  'Library',
  'Containers',
  'com.apple.mail',
  'Data',
  'Library',
  'Mail Downloads',
]);
