import { describe, expect, test } from 'bun:test';
import { exampleDarwinEnvironment } from '../../support/environmentFixtures.js';

describe('buildDarwinEnvironment', () => {
  test('builds every path, guard list and mode of macOS from the values read for the run', () => {
    expect<unknown>(exampleDarwinEnvironment).toEqual({
      nowMs: 0,
      user: { kind: 'posix', uid: 501 },
      pathRules: { rootForm: 'posix', separator: '/' },
      homeDir: '/Users/tester',
      tempDir: '/var/folders/xy/abc/T',
      platformFolders: { kind: 'darwin', userCacheDir: '/var/folders/xy/abc/C' },
      applicationDirs: ['/Applications'],
      fixedDriveRoots: [],
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
