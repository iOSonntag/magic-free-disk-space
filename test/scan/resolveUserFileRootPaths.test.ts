import { describe, expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { win32Platform } from '../../src/platform/win32/win32Platform.js';
import { resolveUserFileRootPaths } from '../../src/scan/resolveUserFileRootPaths.js';
import {
  exampleDarwinEnvironment,
  exampleWin32Environment,
} from '../support/environmentFixtures.js';

describe('resolveUserFileRootPaths', () => {
  test('resolves the folders of macOS below the home, in their order', () => {
    expect<string[]>(
      resolveUserFileRootPaths({
        environment: exampleDarwinEnvironment,
        roots: darwinPlatform.scan.userFileRoots,
      }),
    ).toEqual([
      '/Users/tester/Desktop',
      '/Users/tester/Documents',
      '/Users/tester/Downloads',
      '/Users/tester/Movies',
    ]);
  });

  test('takes the known folders of Windows where they moved, and leaves out a missing one', () => {
    expect<string[]>(
      resolveUserFileRootPaths({
        environment: exampleWin32Environment,
        roots: win32Platform.scan.userFileRoots,
      }),
    ).toEqual([
      'C:\\Users\\tester\\Desktop',
      'C:\\Users\\tester\\OneDrive\\Documents',
      'C:\\Users\\tester\\Downloads',
    ]);
  });

  test('throws for a known folder on macOS, which has none', () => {
    expect(() =>
      resolveUserFileRootPaths({
        environment: exampleDarwinEnvironment,
        roots: [{ root: 'knownFolder', folder: 'desktop', path: '' }],
      }),
    ).toThrow();
  });
});
