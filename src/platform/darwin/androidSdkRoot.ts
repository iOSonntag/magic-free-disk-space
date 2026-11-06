import { stubPartNotBuilt } from '../../notBuilt.js';

/** The Android SDK below the home folder, `~/Library/Android/sdk`. */
export const ANDROID_SDK_PATH_NAMES = ['Library', 'Android', 'sdk'];

/**
 * Flutter's settings file below the home folder, whose `android-sdk` may name a second SDK. Part
 * 4b settles it; until then no probe reads it.
 */
export const FLUTTER_SETTINGS_PATH_NAMES = stubPartNotBuilt(['.config', 'flutter', 'settings']);
