import { describe, expect, test } from 'bun:test';
import { resolveCatalogLocation } from '../../src/catalog/resolveCatalogLocation.js';
import {
  EXAMPLE_DARWIN_ENVIRONMENT,
  EXAMPLE_WIN32_ENVIRONMENT,
} from '../support/environmentFixtures.js';

describe('resolveCatalogLocation', () => {
  test('joins the names of a location below the home or the temporary folder of macOS', () => {
    expect<string>(
      resolveCatalogLocation({
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'home', path: 'Library/Caches/com.example.app' },
      }),
    ).toBe('/Users/tester/Library/Caches/com.example.app');
    expect<string>(
      resolveCatalogLocation({
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'temp', path: 'com.example.cache' },
      }),
    ).toBe('/var/folders/xy/abc/T/com.example.cache');
  });

  test('joins the names below the user cache folder of macOS, and throws on Windows, which has none', () => {
    expect<string>(
      resolveCatalogLocation({
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'userCache', path: 'com.apple.example/Cache' },
      }),
    ).toBe('/var/folders/xy/abc/C/com.apple.example/Cache');
    expect(() =>
      resolveCatalogLocation({
        environment: EXAMPLE_WIN32_ENVIRONMENT,
        location: { root: 'userCache', path: 'com.apple.example' },
      }),
    ).toThrow();
  });

  test('resolves an empty path to the root itself', () => {
    expect<string>(
      resolveCatalogLocation({
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'home', path: '' },
      }),
    ).toBe('/Users/tester');
  });

  test('takes a whole path as it is', () => {
    expect<string>(
      resolveCatalogLocation({
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'absolute', path: '/Library/Caches/com.example.app' },
      }),
    ).toBe('/Library/Caches/com.example.app');
    expect<string>(
      resolveCatalogLocation({
        environment: EXAMPLE_WIN32_ENVIRONMENT,
        location: { root: 'absolute', path: 'c:/ProgramData/Example' },
      }),
    ).toBe('C:\\ProgramData\\Example');
  });

  test('joins the names below each AppData folder of Windows with backslashes', () => {
    expect<string>(
      resolveCatalogLocation({
        environment: EXAMPLE_WIN32_ENVIRONMENT,
        location: { root: 'localAppData', path: 'pnpm/store' },
      }),
    ).toBe('C:\\Users\\tester\\AppData\\Local\\pnpm\\store');
    expect<string>(
      resolveCatalogLocation({
        environment: EXAMPLE_WIN32_ENVIRONMENT,
        location: { root: 'roamingAppData', path: 'Code/User/profiles' },
      }),
    ).toBe('C:\\Users\\tester\\AppData\\Roaming\\Code\\User\\profiles');
  });

  test('throws for an AppData root on macOS, a relative whole path, and a name that is no entry', () => {
    expect(() =>
      resolveCatalogLocation({
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'localAppData', path: 'pnpm' },
      }),
    ).toThrow();
    expect(() =>
      resolveCatalogLocation({
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'absolute', path: 'Library/Caches' },
      }),
    ).toThrow();
    expect(() =>
      resolveCatalogLocation({
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        location: { root: 'home', path: 'Library/../..' },
      }),
    ).toThrow();
  });
});
