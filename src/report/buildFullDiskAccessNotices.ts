import type { FullDiskAccess } from '../system/decideFullDiskAccess.js';
import type { NoticeView } from './noticeView.js';
import { FULL_DISK_ACCESS_SETTINGS_LINK } from './noticeView.js';

/** The banner of the app: one notice while Full Disk Access is off, none when on or unknown. */
export function buildFullDiskAccessNotices(fullDiskAccess: FullDiskAccess): NoticeView[] {
  switch (fullDiskAccess) {
    case 'granted':
    case 'unknown':
      return [];
    case 'denied':
      return [
        {
          titleText: 'Full Disk Access is off',
          lines: [
            "macOS keeps this app out of protected folders, such as the Trash and the caches of Apple's apps, so a scan misses them.",
            'Turn on this app in System Settings > Privacy & Security > Full Disk Access, then quit the app and open it again.',
          ],
          settingsLink: FULL_DISK_ACCESS_SETTINGS_LINK,
        },
      ];
  }
}
