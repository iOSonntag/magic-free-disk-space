import { describe, expect, test } from 'bun:test';
import { isStrictlyInsidePath } from '../../src/path/isStrictlyInsidePath.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import { WIN32_PATH_RULES } from '../../src/platform/win32/loadEnvironment.js';

const RULES = DARWIN_PATH_RULES;

describe('isStrictlyInsidePath', () => {
  test('a path is strictly inside each of its ancestors', () => {
    expect(isStrictlyInsidePath({ rules: RULES, path: '/a/b/c', parentPath: '/a/b' })).toBe(true);
    expect(isStrictlyInsidePath({ rules: RULES, path: '/a/b/c', parentPath: '/a/b/' })).toBe(true);
    expect(isStrictlyInsidePath({ rules: RULES, path: '/a', parentPath: '/' })).toBe(true);
  });

  test('a path is not strictly inside itself', () => {
    expect(isStrictlyInsidePath({ rules: RULES, path: '/a/b', parentPath: '/a/b' })).toBe(false);
    expect(isStrictlyInsidePath({ rules: RULES, path: '/', parentPath: '/' })).toBe(false);
  });

  test('a shared name prefix, a sibling or a holder is not strictly inside', () => {
    expect(isStrictlyInsidePath({ rules: RULES, path: '/a/bc', parentPath: '/a/b' })).toBe(false);
    expect(isStrictlyInsidePath({ rules: RULES, path: '/a/c', parentPath: '/a/b' })).toBe(false);
    expect(isStrictlyInsidePath({ rules: RULES, path: '/a', parentPath: '/a/b' })).toBe(false);
  });

  test('on Windows a path that differs from its parent only by case is the same, not inside', () => {
    expect(
      isStrictlyInsidePath({
        rules: WIN32_PATH_RULES,
        path: 'c:\\users\\TESTER',
        parentPath: 'C:\\Users\\tester',
      }),
    ).toBe(false);
    expect(
      isStrictlyInsidePath({
        rules: WIN32_PATH_RULES,
        path: 'c:\\users\\TESTER\\Downloads',
        parentPath: 'C:\\Users\\tester',
      }),
    ).toBe(true);
  });
});
