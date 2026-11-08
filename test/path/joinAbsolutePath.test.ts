import { describe, expect, test } from 'bun:test';
import {
  joinAbsolutePath,
  listPathNames,
  resolveAbsolutePath,
} from '../../src/path/joinAbsolutePath.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import { buildTestAbsolutePath, buildTestWindowsPath } from '../support/parsedValueFixtures.js';

describe('joinAbsolutePath', () => {
  test('joins each name as one folder level below the parent', () => {
    expect(
      joinAbsolutePath({
        rules: POSIX_PATH_RULES,
        parentPath: buildTestAbsolutePath({ text: '/Users/example' }),
        names: ['Library', 'Android', 'sdk'],
      }),
    ).toBe(buildTestAbsolutePath({ text: '/Users/example/Library/Android/sdk' }));
    expect(
      joinAbsolutePath({
        rules: POSIX_PATH_RULES,
        parentPath: buildTestAbsolutePath({ text: '/opt/homebrew/Cellar/' }),
        names: ['python@3.12'],
      }),
    ).toBe(buildTestAbsolutePath({ text: '/opt/homebrew/Cellar/python@3.12' }));
  });

  test('throws for a name that is no entry of its parent', () => {
    const parentPath = buildTestAbsolutePath({ text: '/opt/homebrew/Cellar' });

    for (const name of ['', '.', '..', 'wget/1.21.4', '../wget']) {
      expect(() =>
        joinAbsolutePath({ rules: POSIX_PATH_RULES, parentPath: parentPath, names: [name] }),
      ).toThrow();
    }
  });

  test('keeps a backslash in a POSIX name, where it is no separator', () => {
    expect(
      joinAbsolutePath({
        rules: POSIX_PATH_RULES,
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

describe('resolveAbsolutePath', () => {
  test('resolves a POSIX text below the base, and keeps an absolute one as it is', () => {
    const basePath = buildTestAbsolutePath({ text: '/Users/example/.vscode/extensions' });

    expect(
      resolveAbsolutePath({ rules: POSIX_PATH_RULES, basePath: basePath, text: '../argv.json' }),
    ).toEqual({
      kind: 'succeeded',
      value: buildTestAbsolutePath({ text: '/Users/example/.vscode/argv.json' }),
    });
    expect(
      resolveAbsolutePath({ rules: POSIX_PATH_RULES, basePath: basePath, text: '/opt/ext' }),
    ).toEqual({ kind: 'succeeded', value: buildTestAbsolutePath({ text: '/opt/ext' }) });
  });

  test('resolves a Windows text by the rules of Windows, whatever platform runs', () => {
    const basePath = buildTestWindowsPath({ text: 'C:\\Users\\tester\\.vscode\\extensions' });

    expect(
      resolveAbsolutePath({
        rules: WIN32_PATH_RULES,
        basePath: basePath,
        text: 'ms-python.python-2025.1.0/out',
      }),
    ).toEqual({
      kind: 'succeeded',
      value: buildTestWindowsPath({
        text: 'C:\\Users\\tester\\.vscode\\extensions\\ms-python.python-2025.1.0\\out',
      }),
    });
    expect(
      resolveAbsolutePath({ rules: WIN32_PATH_RULES, basePath: basePath, text: 'D:\\ext' }),
    ).toEqual({ kind: 'succeeded', value: buildTestWindowsPath({ text: 'D:\\ext' }) });
  });
});

describe('listPathNames', () => {
  test('splits a POSIX path at each slash alone, without the empty names', () => {
    expect(listPathNames({ rules: POSIX_PATH_RULES, path: '/Users//example/a\\b/' })).toEqual([
      'Users',
      'example',
      'a\\b',
    ]);
  });

  test('splits a Windows path at either separator, without the empty names', () => {
    expect(
      listPathNames({ rules: WIN32_PATH_RULES, path: 'C:\\Users\\tester/AppData\\\\Local\\' }),
    ).toEqual(['C:', 'Users', 'tester', 'AppData', 'Local']);
  });
});
