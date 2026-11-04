import { describe, expect, test } from 'bun:test';
import { WIN32_PATH_RULES } from '../../../src/platform/win32/loadEnvironment.js';
import { EXAMPLE_WIN32_ENVIRONMENT } from '../../support/environmentFixtures.js';

const ENVIRONMENT = EXAMPLE_WIN32_ENVIRONMENT;

describe('buildWin32Environment', () => {
  test('keeps the deletion log and the preferences below LocalAppData', () => {
    expect<string>(ENVIRONMENT.deletionLogPath).toBe(
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space\\Logs\\deletions.jsonl',
    );
    expect<string>(ENVIRONMENT.preferencesDir).toBe(
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space',
    );
    expect<string[]>(ENVIRONMENT.sensitiveRealPaths).toEqual([
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space\\Logs',
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space',
    ]);
  });

  test('writes no POSIX modes, and spells paths as Windows does', () => {
    expect(ENVIRONMENT.ownerOnlyModes).toBeNull();
    expect(ENVIRONMENT.pathRules).toEqual(WIN32_PATH_RULES);
  });

  test('carries both AppData folders and the known folders Windows named', () => {
    expect<unknown>(ENVIRONMENT.appDataDirs).toEqual({
      localDir: 'C:\\Users\\tester\\AppData\\Local',
      roamingDir: 'C:\\Users\\tester\\AppData\\Roaming',
    });
    expect<string | null | undefined>(ENVIRONMENT.knownFolderPaths?.documents).toBe(
      'C:\\Users\\tester\\OneDrive\\Documents',
    );
    expect(ENVIRONMENT.knownFolderPaths?.videos).toBeNull();
  });

  test('allows a removal below the profile, both AppData folders, and the temporary folder', () => {
    expect<string[]>(ENVIRONMENT.allowedRealRoots).toEqual([
      'C:\\Users\\tester',
      'C:\\Users\\tester\\AppData\\Local\\Temp',
      'C:\\Users\\tester\\AppData\\Local',
      'C:\\Users\\tester\\AppData\\Roaming',
    ]);
    expect(ENVIRONMENT.applicationDirs).toEqual([]);
  });

  test('has no folder of the system caches, no exception to a sensitive folder, and no cloud folder', () => {
    expect(ENVIRONMENT.userCacheDir).toBeNull();
    expect(ENVIRONMENT.sensitiveExceptionRealPaths).toEqual([]);
    expect(ENVIRONMENT.evictRealRoots).toEqual([]);
  });

  test('refuses as a whole the AppData folder of the profile, the run folders, the guarded folders, and each fixed drive', () => {
    expect<string[]>(ENVIRONMENT.protectedRealPaths).toEqual([
      'C:\\Users\\tester\\AppData',
      'C:\\Users\\tester',
      'C:\\Users\\tester\\AppData\\Local',
      'C:\\Users\\tester\\AppData\\Roaming',
      'C:\\Users\\tester\\OneDrive',
      'C:\\Users\\tester\\AppData\\Local\\Temp',
      'C:\\',
      'D:\\',
    ]);
    expect<string[]>(ENVIRONMENT.protectedRootPaths).toEqual(['C:\\', 'D:\\']);
  });
});
