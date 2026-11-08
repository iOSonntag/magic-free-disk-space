import type { CatalogLocation } from '../../catalog/catalog.js';

/** The folder browsers download into. */
export const downloadsRoot: CatalogLocation = { root: 'home', path: 'Downloads' };

/**
 * iCloud Drive's local folder on macOS: one folder per app that syncs there, and
 * `com~apple~CloudDocs` for the files the person keeps in iCloud Drive. Only an evict may take a
 * file off this Mac here; a delete would delete it on every device.
 */
export const icloudDriveRoot: CatalogLocation = {
  root: 'home',
  path: 'Library/Mobile Documents',
};

/**
 * The copies of the attachments Mail opened, one folder per message; the path of the catalog's
 * `mail-downloads` entry.
 */
export const mailDownloadsRoot: CatalogLocation = {
  root: 'home',
  path: 'Library/Containers/com.apple.mail/Data/Library/Mail Downloads',
};
