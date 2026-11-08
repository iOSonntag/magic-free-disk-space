import { describe, expect, test } from 'bun:test';
import { WIN32_PATH_RULES } from '../../../src/path/pathRules.js';
import {
  buildWin32Environment,
  listProtectedRealPathsBesideTemp,
} from '../../../src/platform/win32/loadEnvironment.js';
import {
  exampleWin32Environment,
  exampleWin32EnvironmentParams,
} from '../../support/environmentFixtures.js';
import { buildTestWindowsPath } from '../../support/parsedValueFixtures.js';

describe('buildWin32Environment', () => {
  test('keeps the deletion log and the preferences below LocalAppData', () => {
    expect<string>(exampleWin32Environment.deletionLogPath).toBe(
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space\\Logs\\deletions.jsonl',
    );
    expect<string>(exampleWin32Environment.preferencesDir).toBe(
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space',
    );
  });

  test('refuses whole and in every part the keys, the credentials, the Teams backgrounds, and the run folders', () => {
    expect<string[]>(exampleWin32Environment.sensitiveRealPaths).toEqual([
      'C:\\Users\\tester\\.ssh',
      'C:\\Users\\tester\\.gnupg',
      'C:\\Users\\tester\\.aws',
      'C:\\Users\\tester\\.azure',
      'C:\\Users\\tester\\.docker',
      'C:\\Users\\tester\\.kube',
      'C:\\Users\\tester\\.config\\gh',
      'C:\\Users\\tester\\AppData\\Roaming\\gnupg',
      'C:\\Users\\tester\\AppData\\Roaming\\GitHub CLI',
      'C:\\Users\\tester\\AppData\\Roaming\\Microsoft\\Credentials',
      'C:\\Users\\tester\\AppData\\Roaming\\Microsoft\\Crypto',
      'C:\\Users\\tester\\AppData\\Roaming\\Microsoft\\Protect',
      'C:\\Users\\tester\\AppData\\Roaming\\Microsoft\\SystemCertificates',
      'C:\\Users\\tester\\AppData\\Roaming\\Microsoft\\Vault',
      'C:\\Users\\tester\\AppData\\Local\\Microsoft\\Credentials',
      'C:\\Users\\tester\\AppData\\Local\\Microsoft\\Vault',
      'C:\\Users\\tester\\AppData\\Local\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\\Microsoft\\MSTeams\\Backgrounds',
      'C:\\Users\\tester\\AppData\\Roaming\\Microsoft\\Teams\\Backgrounds',
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space\\Logs',
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space',
    ]);
  });

  test('writes no POSIX modes, and spells paths as Windows does', () => {
    expect(exampleWin32Environment.ownerOnlyModes).toBeNull();
    expect(exampleWin32Environment.pathRules).toEqual(WIN32_PATH_RULES);
  });

  test('carries both AppData folders and the known folders Windows named as its own folders', () => {
    expect<unknown>(exampleWin32Environment.platformFolders).toEqual({
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
    expect<string[]>(exampleWin32Environment.allowedRealRoots).toEqual([
      'C:\\Users\\tester',
      'C:\\Users\\tester\\AppData\\Local\\Temp',
      'C:\\Users\\tester\\AppData\\Local',
      'C:\\Users\\tester\\AppData\\Roaming',
    ]);
    expect(exampleWin32Environment.applicationDirs).toEqual([]);
  });

  test('has no exception to a sensitive folder and no cloud folder', () => {
    expect(exampleWin32Environment.sensitiveExceptionRealPaths).toEqual([]);
    expect(exampleWin32Environment.evictRealRoots).toEqual([]);
  });

  test('refuses as a whole the profile, its guarded folders, each known folder named, the run folders, and each fixed drive', () => {
    expect<string[]>(exampleWin32Environment.protectedRealPaths).toEqual([
      'C:\\Users\\tester',
      'C:\\Users\\tester\\AppData',
      'C:\\Users\\tester\\.cache',
      'C:\\Users\\tester\\Desktop',
      'C:\\Users\\tester\\OneDrive\\Documents',
      'C:\\Users\\tester\\Downloads',
      'C:\\Users\\tester\\Music',
      'C:\\Users\\tester\\Pictures',
      'C:\\Users\\tester\\AppData\\LocalLow',
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
    expect<string[]>(exampleWin32Environment.fixedDriveRoots).toEqual(['C:\\', 'D:\\']);
    expect<string[]>(exampleWin32Environment.protectedRealPaths.slice(-2)).toEqual(
      exampleWin32Environment.fixedDriveRoots,
    );
  });

  test('refuses a moved known folder at its real path, and leaves out one whose real path is gone', () => {
    const environment = buildWin32Environment({
      ...exampleWin32EnvironmentParams,
      knownFolderRealPaths: {
        ...exampleWin32EnvironmentParams.knownFolderRealPaths,
        desktop: buildTestWindowsPath({ text: 'D:\\Desktop' }),
        downloads: null,
      },
    });

    expect<string[]>(environment.protectedRealPaths).toContain('D:\\Desktop');
    expect<string[]>(environment.protectedRealPaths).not.toContain('C:\\Users\\tester\\Desktop');
    expect<string[]>(environment.protectedRealPaths).not.toContain('C:\\Users\\tester\\Downloads');
    expect<unknown>(environment.platformFolders).toEqual(exampleWin32Environment.platformFolders);
  });
});

describe('listProtectedRealPathsBesideTemp', () => {
  test('leaves out the entry of the temporary folder and keeps every other folder', () => {
    expect(
      listProtectedRealPathsBesideTemp({
        protectedRealPaths: exampleWin32Environment.protectedRealPaths,
        tempRealPath: exampleWin32EnvironmentParams.temp.realPath,
      }),
    ).toEqual(
      exampleWin32Environment.protectedRealPaths.filter(
        (path) => path !== 'C:\\Users\\tester\\AppData\\Local\\Temp',
      ),
    );
  });

  test('keeps a protected folder that is the temporary folder too', () => {
    expect(
      listProtectedRealPathsBesideTemp({
        protectedRealPaths: ['D:\\Documents', 'C:\\', 'D:\\Documents'],
        tempRealPath: 'D:\\Documents',
      }),
    ).toEqual(['C:\\', 'D:\\Documents']);
  });
});
