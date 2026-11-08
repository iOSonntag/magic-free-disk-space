import { describe, expect, test } from 'bun:test';
import {
  findEnvironmentLocationPath,
  resolveEnvironmentLocation,
} from '../../src/environment/environmentLocation.js';
import {
  EXAMPLE_DARWIN_ENVIRONMENT,
  EXAMPLE_WIN32_ENVIRONMENT,
} from '../support/environmentFixtures.js';

describe('resolveEnvironmentLocation', () => {
  test('names the platform and the folder it lacks when a location lies below that folder', () => {
    expect(() =>
      resolveEnvironmentLocation({
        folders: EXAMPLE_WIN32_ENVIRONMENT,
        location: { root: 'userCache', path: 'com.apple.example' },
      }),
    ).toThrow('A location lies below the user cache on Windows, which has none.');
    expect(() =>
      resolveEnvironmentLocation({
        folders: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'roamingAppData', path: 'Code' },
      }),
    ).toThrow('A location lies below a folder of Windows on macOS.');
    expect(() =>
      resolveEnvironmentLocation({
        folders: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'absolute', path: 'Library/Caches' },
      }),
    ).toThrow('The location Library/Caches is not absolute.');
  });
});

describe('findEnvironmentLocationPath', () => {
  test('resolves a location in a known folder below the path Windows names for it', () => {
    expect<string | null>(
      findEnvironmentLocationPath({
        folders: EXAMPLE_WIN32_ENVIRONMENT,
        location: { root: 'knownFolder', folder: 'documents', path: 'Projects/app' },
      }),
    ).toBe('C:\\Users\\tester\\OneDrive\\Documents\\Projects\\app');
    expect<string | null>(
      findEnvironmentLocationPath({
        folders: EXAMPLE_WIN32_ENVIRONMENT,
        location: { root: 'knownFolder', folder: 'desktop', path: '' },
      }),
    ).toBe('C:\\Users\\tester\\Desktop');
  });

  test('finds no path in a known folder Windows names none for', () => {
    expect(
      findEnvironmentLocationPath({
        folders: EXAMPLE_WIN32_ENVIRONMENT,
        location: { root: 'knownFolder', folder: 'videos', path: '' },
      }),
    ).toBeNull();
  });

  test('resolves a location at a root as resolveEnvironmentLocation does', () => {
    expect<string | null>(
      findEnvironmentLocationPath({
        folders: EXAMPLE_WIN32_ENVIRONMENT,
        location: { root: 'localAppData', path: 'pnpm/store' },
      }),
    ).toBe('C:\\Users\\tester\\AppData\\Local\\pnpm\\store');
    expect<string | null>(
      findEnvironmentLocationPath({
        folders: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'userCache', path: '' },
      }),
    ).toBe('/var/folders/xy/abc/C');
  });

  test('throws for a known folder on macOS, which has none', () => {
    expect(() =>
      findEnvironmentLocationPath({
        folders: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'knownFolder', folder: 'documents', path: '' },
      }),
    ).toThrow('A location lies below a folder of Windows on macOS.');
  });
});
