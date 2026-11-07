import type { BrowserBundles, HomeRelativePathNames } from '../../explore/explorePlatform.js';

/** The folder browsers download into. */
export const DOWNLOADS_ROOT_PATH_NAMES: HomeRelativePathNames = ['Downloads'];

/**
 * The browsers that leave a partial download in Downloads: Safari's `.download`, Chrome's and its
 * kin's `.crdownload`, Firefox's `.part`. Safari runs from the system's cryptex, where its process
 * shows, while `/Applications/Safari.app` only points there.
 */
export const BROWSER_BUNDLES: BrowserBundles = {
  appBundleNames: [
    'Google Chrome.app',
    'Google Chrome Beta.app',
    'Google Chrome Canary.app',
    'Chromium.app',
    'Microsoft Edge.app',
    'Brave Browser.app',
    'Arc.app',
    'Vivaldi.app',
    'Opera.app',
    'Firefox.app',
    'Firefox Developer Edition.app',
    'Firefox Nightly.app',
    'Safari Technology Preview.app',
  ],
  systemBundlePaths: [
    '/Applications/Safari.app',
    '/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app',
  ],
};

/** Mail, which keeps its saved attachments open while it runs. */
export const MAIL_BUNDLE_PATHS: string[] = ['/System/Applications/Mail.app'];

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
