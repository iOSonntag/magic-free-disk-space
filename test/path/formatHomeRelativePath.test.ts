import { describe, expect, test } from 'bun:test';
import { sep } from 'node:path';
import { formatHomeRelativePath } from '../../src/path/formatHomeRelativePath.js';

/** The path of `names` below the root, with the separator of the host, which the formatter reads. */
function buildRootedPath(names: string[]): string {
  return ['', ...names].join(sep);
}

/** The path `~` and `names` below it, as the formatter shows a path inside the home folder. */
function buildTildePath(names: string[]): string {
  return ['~', ...names].join(sep);
}

const HOME_DIR = buildRootedPath(['Users', 'me']);

describe('formatHomeRelativePath', () => {
  test('shows the home folder and a path inside it from ~', () => {
    expect(formatHomeRelativePath({ path: HOME_DIR, homeDir: HOME_DIR })).toBe('~');
    expect(
      formatHomeRelativePath({
        path: buildRootedPath(['Users', 'me', 'Movies', 'a.mov']),
        homeDir: HOME_DIR,
      }),
    ).toBe(buildTildePath(['Movies', 'a.mov']));
    expect(
      formatHomeRelativePath({
        path: buildRootedPath(['Users', 'me', 'Movies']),
        homeDir: `${HOME_DIR}${sep}`,
      }),
    ).toBe(buildTildePath(['Movies']));
  });

  test('keeps a path outside the home folder, and one that only shares its name prefix', () => {
    const appPath = buildRootedPath(['Applications', 'Xcode.app']);
    const neighbourPath = buildRootedPath(['Users', 'meier', 'a']);

    expect(formatHomeRelativePath({ path: appPath, homeDir: HOME_DIR })).toBe(appPath);
    expect(formatHomeRelativePath({ path: neighbourPath, homeDir: HOME_DIR })).toBe(neighbourPath);
  });
});
