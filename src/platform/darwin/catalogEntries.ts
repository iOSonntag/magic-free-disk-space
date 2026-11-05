import type { CatalogEntry } from '../../catalog/catalog.js';
import { AI_MODEL_ENTRIES } from './catalog/aiModels.js';
import { ANDROID_ENTRIES } from './catalog/android.js';
import { APP_CACHE_ENTRIES } from './catalog/appCaches.js';
import { BROWSER_ENTRIES } from './catalog/browsers.js';
import { CATCH_ALL_ENTRIES } from './catalog/catchAlls.js';
import { CLAUDE_ENTRIES } from './catalog/claude.js';
import { CONTAINER_ENTRIES } from './catalog/containers.js';
import { DOWNLOAD_ENTRIES } from './catalog/downloads.js';
import { HOMEBREW_ENTRIES } from './catalog/homebrew.js';
import { ICLOUD_ENTRIES } from './catalog/icloud.js';
import { IDE_ENTRIES } from './catalog/ides.js';
import { LANGUAGE_ENTRIES } from './catalog/languages.js';
import { OWN_APP_ENTRIES } from './catalog/ownApp.js';
import { PACKAGE_MANAGER_ENTRIES } from './catalog/packageManagers.js';
import { SYSTEM_ENTRIES } from './catalog/system.js';
import { SYSTEM_LOG_ENTRIES } from './catalog/systemLogs.js';
import { XCODE_ENTRIES } from './catalog/xcode.js';

/**
 * In order of precedence: where two entries overlap, the earlier one wins.
 * A `self` entry comes before the `children` entry whose folder holds it, so the catch-alls join last.
 */
export const CATALOG_ENTRIES: CatalogEntry[] = [
  ...XCODE_ENTRIES,
  ...ANDROID_ENTRIES,
  ...IDE_ENTRIES,
  ...AI_MODEL_ENTRIES,
  ...LANGUAGE_ENTRIES,
  ...PACKAGE_MANAGER_ENTRIES,
  ...HOMEBREW_ENTRIES,
  ...CONTAINER_ENTRIES,
  ...BROWSER_ENTRIES,
  ...APP_CACHE_ENTRIES,
  ...CLAUDE_ENTRIES,
  ...DOWNLOAD_ENTRIES,
  ...ICLOUD_ENTRIES,
  ...SYSTEM_LOG_ENTRIES,
  ...SYSTEM_ENTRIES,
  ...OWN_APP_ENTRIES,
  ...CATCH_ALL_ENTRIES,
];
