import { describe, expect, test } from 'bun:test';
import { DARWIN_PATH_RULES } from '../../../src/platform/darwin/loadEnvironment.js';
import { EXAMPLE_DARWIN_ENVIRONMENT } from '../../support/environmentFixtures.js';

const ENVIRONMENT = EXAMPLE_DARWIN_ENVIRONMENT;

describe('buildDarwinEnvironment', () => {
  test('keeps the deletion log in the Logs folder and the preferences in Application Support', () => {
    expect<string>(ENVIRONMENT.deletionLogPath).toBe(
      '/Users/tester/Library/Logs/magic-free-disk-space/deletions.jsonl',
    );
    expect<string>(ENVIRONMENT.preferencesDir).toBe(
      '/Users/tester/Library/Application Support/magic-free-disk-space',
    );
  });

  test('writes its folders and files for the user alone, and has no AppData or known folders', () => {
    expect(ENVIRONMENT.ownerOnlyModes).toEqual({ directoryMode: 0o700, fileMode: 0o600 });
    expect(ENVIRONMENT.appDataDirs).toBeNull();
    expect(ENVIRONMENT.knownFolderPaths).toBeNull();
    expect(ENVIRONMENT.pathRules).toEqual(DARWIN_PATH_RULES);
  });

  test('allows a removal below the home, the temporary and cache folders, and the app folders', () => {
    expect<string[]>(ENVIRONMENT.allowedRealRoots).toEqual([
      '/Users/tester',
      '/private/var/folders/xy/abc/T',
      '/private/var/folders/xy/abc/C',
      '/Applications',
    ]);
    expect<string[]>(ENVIRONMENT.protectedRootPaths).toEqual(['/']);
  });

  test('names iCloud Drive as its one cloud folder, below the home', () => {
    expect(ENVIRONMENT.evictRealRoots).toEqual(['/Users/tester/Library/Mobile Documents']);
  });
});
