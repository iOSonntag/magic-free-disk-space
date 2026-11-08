import { describe, expect, test } from 'bun:test';
import {
  buildWin32Environment,
  WIN32_PATH_RULES,
} from '../../../src/platform/win32/loadEnvironment.js';
import {
  EXAMPLE_WIN32_ENVIRONMENT,
  EXAMPLE_WIN32_ENVIRONMENT_PARAMS,
} from '../../support/environmentFixtures.js';
import { buildTestWindowsPath } from '../../support/parsedValueFixtures.js';

const ENVIRONMENT = EXAMPLE_WIN32_ENVIRONMENT;

describe('buildWin32Environment', () => {
  test('keeps the deletion log and the preferences below LocalAppData', () => {
    expect<string>(ENVIRONMENT.deletionLogPath).toBe(
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space\\Logs\\deletions.jsonl',
    );
    expect<string>(ENVIRONMENT.preferencesDir).toBe(
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space',
    );
    expect<string[]>(ENVIRONMENT.sensitiveRealPaths.slice(-2)).toEqual([
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space\\Logs',
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space',
    ]);
  });

  test('writes no POSIX modes, and spells paths as Windows does', () => {
    expect(ENVIRONMENT.ownerOnlyModes).toBeNull();
    expect(ENVIRONMENT.pathRules).toEqual(WIN32_PATH_RULES);
  });

  test('carries both AppData folders and the known folders Windows named as its own folders', () => {
    expect<unknown>(ENVIRONMENT.platformFolders).toEqual({
      kind: 'win32',
      appDataDirs: {
        localDir: 'C:\\Users\\tester\\AppData\\Local',
        roamingDir: 'C:\\Users\\tester\\AppData\\Roaming',
      },
      knownFolderPaths: {
        desktop: 'C:\\Users\\tester\\Desktop',
        documents: 'C:\\Users\\tester\\OneDrive\\Documents',
        downloads: 'C:\\Users\\tester\\Downloads',
        videos: null,
        music: 'C:\\Users\\tester\\Music',
        pictures: 'C:\\Users\\tester\\Pictures',
        localAppDataLow: 'C:\\Users\\tester\\AppData\\LocalLow',
        skyDrive: 'C:\\Users\\tester\\OneDrive',
      },
    });
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

  test('has no exception to a sensitive folder and no cloud folder', () => {
    expect(ENVIRONMENT.sensitiveExceptionRealPaths).toEqual([]);
    expect(ENVIRONMENT.evictRealRoots).toEqual([]);
  });

  test('refuses as a whole the profile, its guarded folders, each known folder named, the run folders, and each fixed drive', () => {
    expect<string[]>(ENVIRONMENT.protectedRealPaths).toEqual([
      'C:\\Users\\tester',
      'C:\\Users\\tester\\AppData',
      'C:\\Users\\tester\\.cache',
      'C:\\Users\\tester\\Desktop',
      'C:\\Users\\tester\\OneDrive\\Documents',
      'C:\\Users\\tester\\Downloads',
      'C:\\Users\\tester\\Music',
      'C:\\Users\\tester\\Pictures',
      'C:\\Users\\tester\\AppData\\LocalLow',
      'C:\\Users\\tester\\OneDrive',
      'C:\\Users\\tester\\3D Objects',
      'C:\\Users\\tester\\Contacts',
      'C:\\Users\\tester\\Favorites',
      'C:\\Users\\tester\\Links',
      'C:\\Users\\tester\\Saved Games',
      'C:\\Users\\tester\\Searches',
      'C:\\Users\\tester\\AppData\\Local\\Microsoft',
      'C:\\Users\\tester\\AppData\\Local\\Packages',
      'C:\\Users\\tester\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data',
      'C:\\Users\\tester\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data\\Default',
      'C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\User Data',
      'C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\User Data\\Default',
      'C:\\Users\\tester\\AppData\\Local\\Microsoft\\Edge\\User Data',
      'C:\\Users\\tester\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default',
      'C:\\Users\\tester\\OneDrive',
      'C:\\Users\\tester\\AppData\\Local\\Temp',
      'C:\\Users\\tester\\AppData\\Local',
      'C:\\Users\\tester\\AppData\\Roaming',
      'C:\\',
      'D:\\',
    ]);
  });

  test('lists each fixed drive, whose Recycle Bin the scan counts, from the list it refuses', () => {
    expect<string[]>(ENVIRONMENT.fixedDriveRoots).toEqual(['C:\\', 'D:\\']);
    expect<string[]>(ENVIRONMENT.protectedRealPaths.slice(-2)).toEqual(ENVIRONMENT.fixedDriveRoots);
  });

  test('refuses a moved known folder at its real path, and leaves out one whose real path is gone', () => {
    const environment = buildWin32Environment({
      ...EXAMPLE_WIN32_ENVIRONMENT_PARAMS,
      knownFolderRealPaths: {
        ...EXAMPLE_WIN32_ENVIRONMENT_PARAMS.knownFolderRealPaths,
        desktop: buildTestWindowsPath({ text: 'D:\\Desktop' }),
        downloads: null,
      },
    });

    expect<string[]>(environment.protectedRealPaths).toContain('D:\\Desktop');
    expect<string[]>(environment.protectedRealPaths).not.toContain('C:\\Users\\tester\\Desktop');
    expect<string[]>(environment.protectedRealPaths).not.toContain('C:\\Users\\tester\\Downloads');
    expect<unknown>(environment.platformFolders).toEqual(ENVIRONMENT.platformFolders);
  });
});
