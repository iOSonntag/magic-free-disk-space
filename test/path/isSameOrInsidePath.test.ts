import { describe, expect, test } from 'bun:test';
import { isSameOrInsidePath } from '../../src/path/isSameOrInsidePath.js';

describe('isSameOrInsidePath', () => {
  test('a path is inside itself and its ancestors', () => {
    expect(isSameOrInsidePath({ path: '/a/b', parentPath: '/a/b' })).toBe(true);
    expect(isSameOrInsidePath({ path: '/a/b/c', parentPath: '/a/b' })).toBe(true);
    expect(isSameOrInsidePath({ path: '/a/b/c', parentPath: '/a/b/' })).toBe(true);
    expect(isSameOrInsidePath({ path: '/a', parentPath: '/' })).toBe(true);
  });

  test('a shared name prefix is not containment', () => {
    expect(isSameOrInsidePath({ path: '/a/bc', parentPath: '/a/b' })).toBe(false);
    expect(isSameOrInsidePath({ path: '/a', parentPath: '/a/b' })).toBe(false);
  });
});
