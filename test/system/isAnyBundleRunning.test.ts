import { describe, expect, test } from 'bun:test';
import { isAnyBundleRunning } from '../../src/system/isAnyBundleRunning.js';

describe('isAnyBundleRunning', () => {
  test('finds a Mac app and an iOS app on a Mac running from their bundles', () => {
    expect(
      isAnyBundleRunning({
        bundlePaths: ['/Applications/Mac.app'],
        processCommands: ['/Applications/Mac.app/Contents/MacOS/Mac --flag'],
      }),
    ).toBe(true);
    expect(
      isAnyBundleRunning({
        bundlePaths: ['/Applications/Phone.app'],
        processCommands: ['/Applications/Phone.app/Wrapper/Phone.app/Phone'],
      }),
    ).toBe(true);
  });

  test('ignores a bundle whose path only shares a prefix, and an empty list', () => {
    expect(
      isAnyBundleRunning({
        bundlePaths: ['/Applications/Mac.app'],
        processCommands: ['/Applications/Mac.app.old/Contents/MacOS/Mac'],
      }),
    ).toBe(false);
    expect(isAnyBundleRunning({ bundlePaths: [], processCommands: ['/bin/zsh'] })).toBe(false);
  });
});
