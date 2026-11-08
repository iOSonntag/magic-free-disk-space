import { describe, expect, test } from 'bun:test';
import { USER_FILE_ROOTS } from '../../src/platform/darwin/scanHomeFolders.js';
import { WIN32_CATALOG } from '../../src/platform/win32/catalog/win32Catalog.js';
import { resolveUserFileRootPaths } from '../../src/scan/resolveUserFileRootPaths.js';
import {
  EXAMPLE_DARWIN_ENVIRONMENT,
  EXAMPLE_WIN32_ENVIRONMENT,
} from '../support/environmentFixtures.js';

describe('resolveUserFileRootPaths', () => {
  test('resolves the folders of macOS below the home, in their order', () => {
    expect<string[]>(
      resolveUserFileRootPaths({ environment: EXAMPLE_DARWIN_ENVIRONMENT, roots: USER_FILE_ROOTS }),
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
        environment: EXAMPLE_WIN32_ENVIRONMENT,
        roots: WIN32_CATALOG.userFileRoots,
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
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        roots: [{ root: 'knownFolder', folder: 'desktop', path: '' }],
      }),
    ).toThrow();
  });
});
