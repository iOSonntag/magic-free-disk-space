import { describe, expect, test } from 'bun:test';
import {
  buildLocationBelow,
  findEnvironmentLocationPath,
  findEnvironmentLocationPaths,
  resolveEnvironmentLocation,
  resolveEnvironmentLocations,
} from '../../src/environment/environmentLocation.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { buildWin32Environment } from '../../src/platform/win32/loadEnvironment.js';
import { win32Platform } from '../../src/platform/win32/win32Platform.js';
import {
  exampleDarwinEnvironment,
  exampleWin32Environment,
  exampleWin32EnvironmentParams,
} from '../support/environmentFixtures.js';
import { buildTestWindowsPath } from '../support/parsedValueFixtures.js';

describe('buildLocationBelow', () => {
  test('keeps the root of the location and joins the paths with a slash', () => {
    expect(
      buildLocationBelow({
        location: { root: 'localAppData', path: 'Android/Sdk' },
        path: 'system-images/android-34',
      }),
    ).toEqual({ root: 'localAppData', path: 'Android/Sdk/system-images/android-34' });
  });

  test('names a place below the root itself by its own path', () => {
    expect(buildLocationBelow({ location: { root: 'home', path: '' }, path: '.ssh' })).toEqual({
      root: 'home',
      path: '.ssh',
    });
  });
});

describe('resolveEnvironmentLocation', () => {
  test('joins the names of a location below the home or the temporary folder of macOS', () => {
    expect<string>(
      resolveEnvironmentLocation({
        folders: exampleDarwinEnvironment,
        location: { root: 'home', path: 'Library/Caches/com.example.app' },
      }),
    ).toBe('/Users/tester/Library/Caches/com.example.app');
    expect<string>(
      resolveEnvironmentLocation({
        folders: exampleDarwinEnvironment,
        location: { root: 'temp', path: 'com.example.cache' },
      }),
    ).toBe('/var/folders/xy/abc/T/com.example.cache');
  });

  test('joins the names below the user cache folder of macOS', () => {
    expect<string>(
      resolveEnvironmentLocation({
        folders: exampleDarwinEnvironment,
        location: { root: 'userCache', path: 'com.apple.example/Cache' },
      }),
    ).toBe('/var/folders/xy/abc/C/com.apple.example/Cache');
  });

  test('joins the names below each AppData folder of Windows with backslashes', () => {
    expect<string>(
      resolveEnvironmentLocation({
        folders: exampleWin32Environment,
        location: { root: 'localAppData', path: 'pnpm/store' },
      }),
    ).toBe('C:\\Users\\tester\\AppData\\Local\\pnpm\\store');
    expect<string>(
      resolveEnvironmentLocation({
        folders: exampleWin32Environment,
        location: { root: 'roamingAppData', path: 'Code/User/profiles' },
      }),
    ).toBe('C:\\Users\\tester\\AppData\\Roaming\\Code\\User\\profiles');
  });

  test('resolves an empty path to the root itself', () => {
    expect<string>(
      resolveEnvironmentLocation({
        folders: exampleDarwinEnvironment,
        location: { root: 'home', path: '' },
      }),
    ).toBe('/Users/tester');
  });

  test('takes a whole path as the rules of the platform parse it', () => {
    expect<string>(
      resolveEnvironmentLocation({
        folders: exampleDarwinEnvironment,
        location: { root: 'absolute', path: '/Library/Caches/com.example.app' },
      }),
    ).toBe('/Library/Caches/com.example.app');
    expect<string>(
      resolveEnvironmentLocation({
        folders: exampleWin32Environment,
        location: { root: 'absolute', path: 'c:/ProgramData/Example' },
      }),
    ).toBe('C:\\ProgramData\\Example');
  });

  test('names the platform and the folder it lacks when a location lies below that folder', () => {
    expect(() =>
      resolveEnvironmentLocation({
        folders: exampleWin32Environment,
        location: { root: 'userCache', path: 'com.apple.example' },
      }),
    ).toThrow('A location lies below the user cache on Windows, which has none.');
    expect(() =>
      resolveEnvironmentLocation({
        folders: exampleDarwinEnvironment,
        location: { root: 'localAppData', path: 'pnpm' },
      }),
    ).toThrow('A location lies below a folder of Windows on macOS.');
    expect(() =>
      resolveEnvironmentLocation({
        folders: exampleDarwinEnvironment,
        location: { root: 'roamingAppData', path: 'Code' },
      }),
    ).toThrow('A location lies below a folder of Windows on macOS.');
  });

  test('throws for a whole path that is not absolute and for a name that is no entry', () => {
    expect(() =>
      resolveEnvironmentLocation({
        folders: exampleDarwinEnvironment,
        location: { root: 'absolute', path: 'Library/Caches' },
      }),
    ).toThrow('The location Library/Caches is not absolute.');
    expect(() =>
      resolveEnvironmentLocation({
        folders: exampleDarwinEnvironment,
        location: { root: 'home', path: 'Library/../..' },
      }),
    ).toThrow('".." is no entry name to join below a folder.');
  });
});

describe('resolveEnvironmentLocations', () => {
  test('resolves each location below its root, in the order of the locations', () => {
    expect<string[]>(
      resolveEnvironmentLocations({
        folders: exampleWin32Environment,
        locations: [
          { root: 'roamingAppData', path: 'Code/User/profiles' },
          { root: 'home', path: '' },
          { root: 'localAppData', path: 'pnpm/store' },
        ],
      }),
    ).toEqual([
      'C:\\Users\\tester\\AppData\\Roaming\\Code\\User\\profiles',
      'C:\\Users\\tester',
      'C:\\Users\\tester\\AppData\\Local\\pnpm\\store',
    ]);
  });

  test('throws as resolveEnvironmentLocation does for a location among them', () => {
    expect(() =>
      resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: [
          { root: 'home', path: 'Library' },
          { root: 'localAppData', path: 'pnpm' },
        ],
      }),
    ).toThrow('A location lies below a folder of Windows on macOS.');
  });
});

describe('findEnvironmentLocationPath', () => {
  test('resolves a location in a known folder below the path Windows names for it', () => {
    expect<string | null>(
      findEnvironmentLocationPath({
        folders: exampleWin32Environment,
        location: { root: 'knownFolder', folder: 'documents', path: 'Projects/app' },
      }),
    ).toBe('C:\\Users\\tester\\OneDrive\\Documents\\Projects\\app');
    expect<string | null>(
      findEnvironmentLocationPath({
        folders: exampleWin32Environment,
        location: { root: 'knownFolder', folder: 'desktop', path: '' },
      }),
    ).toBe('C:\\Users\\tester\\Desktop');
  });

  test('finds no path in a known folder Windows names none for', () => {
    expect(
      findEnvironmentLocationPath({
        folders: exampleWin32Environment,
        location: { root: 'knownFolder', folder: 'videos', path: '' },
      }),
    ).toBeNull();
  });

  test('resolves a location at a root as resolveEnvironmentLocation does', () => {
    expect<string | null>(
      findEnvironmentLocationPath({
        folders: exampleWin32Environment,
        location: { root: 'localAppData', path: 'pnpm/store' },
      }),
    ).toBe('C:\\Users\\tester\\AppData\\Local\\pnpm\\store');
    expect<string | null>(
      findEnvironmentLocationPath({
        folders: exampleDarwinEnvironment,
        location: { root: 'userCache', path: '' },
      }),
    ).toBe('/var/folders/xy/abc/C');
  });

  test('throws for a known folder on macOS, which has none', () => {
    expect(() =>
      findEnvironmentLocationPath({
        folders: exampleDarwinEnvironment,
        location: { root: 'knownFolder', folder: 'documents', path: '' },
      }),
    ).toThrow('A location lies below a folder of Windows on macOS.');
  });
});

describe('findEnvironmentLocationPaths', () => {
  test('resolves the user-file roots of macOS below the home, in their order', () => {
    expect<string[]>(
      findEnvironmentLocationPaths({
        folders: exampleDarwinEnvironment,
        locations: darwinPlatform.scan.userFileRoots,
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
      findEnvironmentLocationPaths({
        folders: exampleWin32Environment,
        locations: win32Platform.scan.userFileRoots,
      }),
    ).toEqual([
      'C:\\Users\\tester\\Desktop',
      'C:\\Users\\tester\\OneDrive\\Documents',
      'C:\\Users\\tester\\Downloads',
    ]);
  });

  test('resolves the four known folders of the user files of Windows, in their order', () => {
    const knownFolderPaths = {
      ...exampleWin32EnvironmentParams.knownFolderPaths,
      videos: buildTestWindowsPath({ text: 'D:\\Videos' }),
    };
    const environment = buildWin32Environment({
      ...exampleWin32EnvironmentParams,
      knownFolderPaths: knownFolderPaths,
      knownFolderRealPaths: knownFolderPaths,
    });

    expect<string[]>(
      findEnvironmentLocationPaths({
        folders: environment,
        locations: win32Platform.scan.userFileRoots,
      }),
    ).toEqual([
      'C:\\Users\\tester\\Desktop',
      'C:\\Users\\tester\\OneDrive\\Documents',
      'C:\\Users\\tester\\Downloads',
      'D:\\Videos',
    ]);
  });

  test('throws as findEnvironmentLocationPath does for a known folder on macOS', () => {
    expect(() =>
      findEnvironmentLocationPaths({
        folders: exampleDarwinEnvironment,
        locations: [
          { root: 'home', path: 'Desktop' },
          { root: 'knownFolder', folder: 'desktop', path: '' },
        ],
      }),
    ).toThrow('A location lies below a folder of Windows on macOS.');
  });
});
