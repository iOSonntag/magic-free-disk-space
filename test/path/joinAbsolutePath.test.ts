import { describe, expect, test } from 'bun:test';
import { joinAbsolutePath } from '../../src/path/joinAbsolutePath.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import { WIN32_PATH_RULES } from '../../src/platform/win32/loadEnvironment.js';
import { buildTestAbsolutePath, buildTestWindowsPath } from '../support/parsedValueFixtures.js';

describe('joinAbsolutePath', () => {
  test('joins each name as one folder level below the parent', () => {
    expect(
      joinAbsolutePath({
        rules: DARWIN_PATH_RULES,
        parentPath: buildTestAbsolutePath({ text: '/Users/example' }),
        names: ['Library', 'Android', 'sdk'],
      }),
    ).toBe(buildTestAbsolutePath({ text: '/Users/example/Library/Android/sdk' }));
    expect(
      joinAbsolutePath({
        rules: DARWIN_PATH_RULES,
        parentPath: buildTestAbsolutePath({ text: '/opt/homebrew/Cellar/' }),
        names: ['python@3.12'],
      }),
    ).toBe(buildTestAbsolutePath({ text: '/opt/homebrew/Cellar/python@3.12' }));
  });

  test('throws for a name that is no entry of its parent', () => {
    const parentPath = buildTestAbsolutePath({ text: '/opt/homebrew/Cellar' });

    for (const name of ['', '.', '..', 'wget/1.21.4', '../wget']) {
      expect(() =>
        joinAbsolutePath({ rules: DARWIN_PATH_RULES, parentPath: parentPath, names: [name] }),
      ).toThrow();
    }
  });

  test('keeps a backslash in a POSIX name, where it is no separator', () => {
    expect(
      joinAbsolutePath({
        rules: DARWIN_PATH_RULES,
        parentPath: buildTestAbsolutePath({ text: '/tmp' }),
        names: ['a\\b'],
      }),
    ).toBe(buildTestAbsolutePath({ text: '/tmp/a\\b' }));
  });

  test('joins a Windows name below a drive root and below a folder with backslashes', () => {
    expect(
      joinAbsolutePath({
        rules: WIN32_PATH_RULES,
        parentPath: buildTestWindowsPath({ text: 'C:\\' }),
        names: ['Users'],
      }),
    ).toBe(buildTestWindowsPath({ text: 'C:\\Users' }));
    expect(
      joinAbsolutePath({
        rules: WIN32_PATH_RULES,
        parentPath: buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Local' }),
        names: ['pnpm', 'store'],
      }),
    ).toBe(buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Local\\pnpm\\store' }));
  });

  test('throws for a Windows name that holds either separator', () => {
    const parentPath = buildTestWindowsPath({ text: 'C:\\Users\\tester' });

    for (const name of ['AppData\\Local', 'AppData/Local', '..', '']) {
      expect(() =>
        joinAbsolutePath({ rules: WIN32_PATH_RULES, parentPath: parentPath, names: [name] }),
      ).toThrow();
    }
  });
});
