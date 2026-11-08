import type { CatalogLocation } from '../../catalog/catalog.js';

/** The Android SDK, `~/Library/Android/sdk`. */
export const androidSdkRoot: CatalogLocation = { root: 'home', path: 'Library/Android/sdk' };

/**
 * Flutter's settings files, which may name another Android SDK, in Flutter's order: the legacy
 * `~/.flutter_settings` wins while it exists, else `~/.config/flutter/settings`.
 */
export const FLUTTER_SETTINGS_PATHS: CatalogLocation[] = [
  { root: 'home', path: '.flutter_settings' },
  { root: 'home', path: '.config/flutter/settings' },
];
