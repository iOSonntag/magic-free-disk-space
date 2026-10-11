import { describe, expect, test } from 'bun:test';
import {
  getXcodeBundlePath,
  loadActiveXcodeBundlePath,
} from '../../src/scan/loadActiveXcodeBundlePath.js';

describe('getXcodeBundlePath', () => {
  test('returns the app bundle above the developer directory', () => {
    const bundlePath = getXcodeBundlePath({
      developerDirPath: '/Applications/Xcode.app/Contents/Developer',
    });

    expect(bundlePath).toBe('/Applications/Xcode.app');
  });

  test('keeps a bundle name with a dash, as a beta Xcode has', () => {
    const bundlePath = getXcodeBundlePath({
      developerDirPath: '/Applications/Xcode-beta.app/Contents/Developer',
    });

    expect(bundlePath).toBe('/Applications/Xcode-beta.app');
  });

  test('returns the outermost bundle when another bundle lies inside it', () => {
    const bundlePath = getXcodeBundlePath({
      developerDirPath: '/Applications/Xcode.app/Contents/Developer/Tools/Helper.app/Contents',
    });

    expect(bundlePath).toBe('/Applications/Xcode.app');
  });

  test('returns null for the Command Line Tools, which lie in no bundle', () => {
    const bundlePath = getXcodeBundlePath({
      developerDirPath: '/Library/Developer/CommandLineTools',
    });

    expect(bundlePath).toBeNull();
  });
});

describe('loadActiveXcodeBundlePath', () => {
  test('reads the active developer directory of this Mac', async () => {
    const result = await loadActiveXcodeBundlePath({ commandTimeoutMs: 5_000 });

    if (result.kind === 'failed') {
      throw new Error(`xcode-select failed: ${result.failure.reason}`);
    }

    expect(result.value === null || result.value.endsWith('.app')).toBe(true);
  });
});
