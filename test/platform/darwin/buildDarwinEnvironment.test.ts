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

  test('writes its folders and files for the user alone, and has only the folder of the system caches as its own', () => {
    expect(ENVIRONMENT.ownerOnlyModes).toEqual({ directoryMode: 0o700, fileMode: 0o600 });
    expect<unknown>(ENVIRONMENT.platformFolders).toEqual({
      kind: 'darwin',
      userCacheDir: '/var/folders/xy/abc/C',
    });
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

  test('builds every path and guard list as before the locations of the run met in one resolver', () => {
    expect<unknown>(ENVIRONMENT).toEqual({
      nowMs: 0,
      user: { kind: 'posix', uid: 501 },
      pathRules: { rootForm: 'posix', separator: '/' },
      homeDir: '/Users/tester',
      tempDir: '/var/folders/xy/abc/T',
      platformFolders: { kind: 'darwin', userCacheDir: '/var/folders/xy/abc/C' },
      applicationDirs: ['/Applications'],
      protectedRootPaths: ['/'],
      allowedRealRoots: [
        '/Users/tester',
        '/private/var/folders/xy/abc/T',
        '/private/var/folders/xy/abc/C',
        '/Applications',
      ],
      protectedRealPaths: [
        '/Users/tester',
        '/Users/tester/.cache',
        '/Users/tester/.Trash',
        '/Users/tester/Applications',
        '/Users/tester/Desktop',
        '/Users/tester/Documents',
        '/Users/tester/Downloads',
        '/Users/tester/Movies',
        '/Users/tester/Music',
        '/Users/tester/Pictures',
        '/Users/tester/go',
        '/Users/tester/Library',
        '/Users/tester/Library/Application Support',
        '/Users/tester/Library/Caches',
        '/Users/tester/Library/Containers',
        '/Users/tester/Library/Developer',
        '/Users/tester/Library/Group Containers',
        '/Users/tester/Library/Mobile Documents',
        '/Users/tester/Library/Preferences',
        '/private/var/folders/xy/abc/T',
        '/private/var/folders/xy/abc/C',
        '/',
      ],
      sensitiveRealPaths: [
        '/Users/tester/.ssh',
        '/Users/tester/.gnupg',
        '/Users/tester/Library/Keychains',
        '/Users/tester/Library/Mail',
        '/Users/tester/Library/Messages',
        '/Users/tester/Pictures/Photos Library.photoslibrary',
        '/Users/tester/Library/Application Support/MobileSync',
        '/Users/tester/Library/Logs/magic-free-disk-space',
        '/Users/tester/Library/Application Support/magic-free-disk-space',
      ],
      sensitiveExceptionRealPaths: [
        '/Users/tester/Library/Messages/Caches/Previews/Attachments',
        '/Users/tester/Library/Messages/Caches/Previews/StickerCache',
        '/Users/tester/Library/Messages/StickerCache',
      ],
      evictRealRoots: ['/Users/tester/Library/Mobile Documents'],
      deletionLogPath: '/Users/tester/Library/Logs/magic-free-disk-space/deletions.jsonl',
      preferencesDir: '/Users/tester/Library/Application Support/magic-free-disk-space',
      ownerOnlyModes: { directoryMode: 0o700, fileMode: 0o600 },
    });
  });
});
