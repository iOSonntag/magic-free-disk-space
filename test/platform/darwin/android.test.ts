import { describe, expect, test } from 'bun:test';
import { ANDROID_ENTRIES } from '../../../src/platform/darwin/catalog/android.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('ANDROID_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(ANDROID_ENTRIES)).toEqual({
      'android-emulators': ['careful', '.android/avd'],
      'android-system-images': ['review', 'Library/Android/sdk/system-images'],
      'android-emulator-binaries': ['review', 'Library/Android/sdk/emulator'],
      'android-platforms': ['review', 'Library/Android/sdk/platforms'],
      'gradle-caches': ['review', '.gradle/caches'],
      'gradle-wrapper-distributions': ['safe', '.gradle/wrapper/dists'],
      'gradle-daemon-logs': ['review', '.gradle/daemon'],
    });
  });
});
