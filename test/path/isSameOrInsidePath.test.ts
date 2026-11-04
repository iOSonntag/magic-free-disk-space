import { describe, expect, test } from 'bun:test';
import { DARWIN_PATH_RULES } from '../../src/environment/loadEnvironment.js';
import { isSameOrInsidePath } from '../../src/path/isSameOrInsidePath.js';

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
});
