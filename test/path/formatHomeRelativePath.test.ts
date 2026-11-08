import { describe, expect, test } from 'bun:test';
import { formatHomeRelativePath } from '../../src/path/formatHomeRelativePath.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';

const HOME_DIR = '/Users/me';

const WINDOWS_HOME_DIR = 'C:\\Users\\Oli';

describe('formatHomeRelativePath', () => {
  test('shows the home folder and a path inside it from ~ on POSIX', () => {
    expect(
      formatHomeRelativePath({ rules: POSIX_PATH_RULES, path: HOME_DIR, homeDir: HOME_DIR }),
    ).toBe('~');
    expect(
      formatHomeRelativePath({
        rules: POSIX_PATH_RULES,
        path: '/Users/me/Movies/a.mov',
        homeDir: HOME_DIR,
      }),
    ).toBe('~/Movies/a.mov');
    expect(
      formatHomeRelativePath({
        rules: POSIX_PATH_RULES,
        path: '/Users/me/Movies',
        homeDir: `${HOME_DIR}/`,
      }),
    ).toBe('~/Movies');
  });

  test('keeps a POSIX path outside the home folder, one that only shares its name prefix, and one in another case', () => {
    for (const path of ['/Applications/Xcode.app', '/Users/meier/a', '/Users/Me/a']) {
      expect(
        formatHomeRelativePath({ rules: POSIX_PATH_RULES, path: path, homeDir: HOME_DIR }),
      ).toBe(path);
    }
  });

  test('shows a Windows path inside the home folder from ~ in its own case, whatever the case of the home', () => {
    expect(
      formatHomeRelativePath({
        rules: WIN32_PATH_RULES,
        path: 'c:\\users\\oli',
        homeDir: WINDOWS_HOME_DIR,
      }),
    ).toBe('~');
    expect(
      formatHomeRelativePath({
        rules: WIN32_PATH_RULES,
        path: 'C:\\Users\\Oli\\Videos\\a.mp4',
        homeDir: WINDOWS_HOME_DIR,
      }),
    ).toBe('~\\Videos\\a.mp4');
    expect(
      formatHomeRelativePath({
        rules: WIN32_PATH_RULES,
        path: 'c:\\USERS\\oli\\AppData\\Local\\Temp',
        homeDir: WINDOWS_HOME_DIR,
      }),
    ).toBe('~\\AppData\\Local\\Temp');
    expect(
      formatHomeRelativePath({
        rules: WIN32_PATH_RULES,
        path: 'C:\\Users\\Oli\\Videos',
        homeDir: `${WINDOWS_HOME_DIR}\\`,
      }),
    ).toBe('~\\Videos');
  });

  test('shows a Windows path below a home at a drive root from ~', () => {
    expect(formatHomeRelativePath({ rules: WIN32_PATH_RULES, path: 'D:\\', homeDir: 'D:\\' })).toBe(
      '~',
    );
    expect(
      formatHomeRelativePath({ rules: WIN32_PATH_RULES, path: 'd:\\Data\\a.bin', homeDir: 'D:\\' }),
    ).toBe('~\\Data\\a.bin');
  });

  test('keeps a Windows path outside the home folder and one in a neighbour folder', () => {
    for (const path of [
      'C:\\Program Files\\Example',
      'C:\\Users\\Oliver\\a',
      'D:\\Users\\Oli\\a',
    ]) {
      expect(
        formatHomeRelativePath({ rules: WIN32_PATH_RULES, path: path, homeDir: WINDOWS_HOME_DIR }),
      ).toBe(path);
    }
  });
});
