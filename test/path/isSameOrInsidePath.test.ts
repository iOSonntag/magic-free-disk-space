import { describe, expect, test } from 'bun:test';
import {
  isSameEntryName,
  isSameOrInsidePath,
  isSamePath,
  mayBeSameOrInsidePath,
  toComparablePathText,
} from '../../src/path/isSameOrInsidePath.js';
import { WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';

const RULES = DARWIN_PATH_RULES;

describe('isSameOrInsidePath', () => {
  test('a path is inside itself and its ancestors', () => {
    expect(isSameOrInsidePath({ rules: RULES, path: '/a/b', parentPath: '/a/b' })).toBe(true);
    expect(isSameOrInsidePath({ rules: RULES, path: '/a/b/c', parentPath: '/a/b' })).toBe(true);
    expect(isSameOrInsidePath({ rules: RULES, path: '/a/b/c', parentPath: '/a/b/' })).toBe(true);
    expect(isSameOrInsidePath({ rules: RULES, path: '/a', parentPath: '/' })).toBe(true);
  });

  test('a shared name prefix is not containment', () => {
    expect(isSameOrInsidePath({ rules: RULES, path: '/a/bc', parentPath: '/a/b' })).toBe(false);
    expect(isSameOrInsidePath({ rules: RULES, path: '/a', parentPath: '/a/b' })).toBe(false);
  });

  test('compares the names of a POSIX path exactly', () => {
    expect(isSameOrInsidePath({ rules: RULES, path: '/Users/A/x', parentPath: '/users/a' })).toBe(
      false,
    );
  });

  test('compares the names of a Windows path without case, by whole names', () => {
    const windows = WIN32_PATH_RULES;

    expect(
      isSameOrInsidePath({ rules: windows, path: 'c:\\USERS\\tester\\x', parentPath: 'C:\\Users' }),
    ).toBe(true);
    expect(isSameOrInsidePath({ rules: windows, path: 'C:\\Users', parentPath: 'C:\\' })).toBe(
      true,
    );
    expect(
      isSameOrInsidePath({ rules: windows, path: 'C:\\Users2', parentPath: 'C:\\Users' }),
    ).toBe(false);
    expect(isSameOrInsidePath({ rules: windows, path: 'D:\\Users', parentPath: 'C:\\' })).toBe(
      false,
    );
  });
});

describe('mayBeSameOrInsidePath', () => {
  test('matches a POSIX path that differs only by case, as a refusal needs', () => {
    expect(
      mayBeSameOrInsidePath({
        rules: RULES,
        path: '/users/TESTER/x',
        parentPath: '/Users/tester',
      }),
    ).toBe(true);
    expect(
      mayBeSameOrInsidePath({
        rules: RULES,
        path: '/Users/tester2',
        parentPath: '/Users/tester',
      }),
    ).toBe(false);
  });

  test('matches a Windows path without case, by whole names', () => {
    expect(
      mayBeSameOrInsidePath({
        rules: WIN32_PATH_RULES,
        path: 'c:\\users\\TESTER',
        parentPath: 'C:\\Users',
      }),
    ).toBe(true);
  });
});

describe('isSameEntryName', () => {
  test('compares the names of POSIX entries exactly', () => {
    expect(isSameEntryName({ rules: RULES, name: 'node_modules', otherName: 'node_modules' })).toBe(
      true,
    );
    expect(isSameEntryName({ rules: RULES, name: 'Library', otherName: 'library' })).toBe(false);
  });

  test('compares the names of Windows entries without case', () => {
    expect(
      isSameEntryName({ rules: WIN32_PATH_RULES, name: 'AppData', otherName: 'APPDATA' }),
    ).toBe(true);
    expect(
      isSameEntryName({ rules: WIN32_PATH_RULES, name: 'AppData', otherName: 'AppData2' }),
    ).toBe(false);
  });
});

describe('isSamePath', () => {
  test('compares a POSIX path exactly', () => {
    expect(isSamePath({ rules: RULES, path: '/Users/tester', otherPath: '/Users/tester' })).toBe(
      true,
    );
    expect(isSamePath({ rules: RULES, path: '/Users/tester', otherPath: '/users/Tester' })).toBe(
      false,
    );
  });

  test('compares a Windows path without case, and never as containment', () => {
    expect(
      isSamePath({
        rules: WIN32_PATH_RULES,
        path: 'C:\\Users\\Tester\\AppData',
        otherPath: 'c:\\users\\tester\\APPDATA',
      }),
    ).toBe(true);
    expect(
      isSamePath({
        rules: WIN32_PATH_RULES,
        path: 'C:\\Users\\tester\\AppData\\Local',
        otherPath: 'C:\\Users\\tester\\AppData',
      }),
    ).toBe(false);
  });
});

describe('toComparablePathText', () => {
  test('leaves a POSIX name as it is', () => {
    expect(toComparablePathText({ rules: RULES, text: 'Foo.CSPROJ' })).toBe('Foo.CSPROJ');
  });

  test('folds the case of a Windows name or path', () => {
    expect(toComparablePathText({ rules: WIN32_PATH_RULES, text: 'Foo.CSPROJ' })).toBe(
      'foo.csproj',
    );
    expect(toComparablePathText({ rules: WIN32_PATH_RULES, text: 'C:\\Tools\\CODE.EXE' })).toBe(
      'c:\\tools\\code.exe',
    );
  });
});
