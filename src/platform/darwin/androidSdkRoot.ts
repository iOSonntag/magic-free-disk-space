import type { HomeRelativePathNames } from '../../explore/explorePlatform.js';

/** The Android SDK below the home folder, `~/Library/Android/sdk`. */
export const ANDROID_SDK_PATH_NAMES = ['Library', 'Android', 'sdk'];

/**
 * Flutter's settings files below the home folder, which may name another Android SDK, in
 * Flutter's order: the legacy `~/.flutter_settings` wins while it exists, else
 * `~/.config/flutter/settings`.
 */
export const FLUTTER_SETTINGS_PATHS: HomeRelativePathNames[] = [
  ['.flutter_settings'],
  ['.config', 'flutter', 'settings'],
];
