import { expect, test } from 'bun:test';
import { formatHomeRelativePath } from '../../src/path/formatHomeRelativePath.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';

const HOME_DIR = '/Users/me';

describeAwaitingWin32Platform('formatHomeRelativePath', () => {
  test('shows the home folder and a path inside it from ~', () => {
    expect(formatHomeRelativePath({ path: HOME_DIR, homeDir: HOME_DIR })).toBe('~');
    expect(formatHomeRelativePath({ path: `${HOME_DIR}/Movies/a.mov`, homeDir: HOME_DIR })).toBe(
      '~/Movies/a.mov',
    );
    expect(formatHomeRelativePath({ path: `${HOME_DIR}/Movies`, homeDir: `${HOME_DIR}/` })).toBe(
      '~/Movies',
    );
  });

  test('keeps a path outside the home folder, and one that only shares its name prefix', () => {
    expect(formatHomeRelativePath({ path: '/Applications/Xcode.app', homeDir: HOME_DIR })).toBe(
      '/Applications/Xcode.app',
    );
    expect(formatHomeRelativePath({ path: '/Users/meier/a', homeDir: HOME_DIR })).toBe(
      '/Users/meier/a',
    );
  });
});
