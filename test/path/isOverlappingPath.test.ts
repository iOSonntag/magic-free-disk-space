import { describe, expect, test } from 'bun:test';
import { isOverlappingPath } from '../../src/path/isOverlappingPath.js';
import { POSIX_PATH_RULES } from '../../src/path/pathRules.js';

const RULES = POSIX_PATH_RULES;

describe('isOverlappingPath', () => {
  test('a path overlaps itself, a path it holds and a path it lies in', () => {
    expect(isOverlappingPath({ rules: RULES, path: '/a/b', otherPath: '/a/b' })).toBe(true);
    expect(isOverlappingPath({ rules: RULES, path: '/a/b', otherPath: '/a/b/c' })).toBe(true);
    expect(isOverlappingPath({ rules: RULES, path: '/a/b/c', otherPath: '/a/b' })).toBe(true);
  });

  test('a sibling or a path that only shares a prefix does not overlap', () => {
    expect(isOverlappingPath({ rules: RULES, path: '/a/b', otherPath: '/a/c' })).toBe(false);
    expect(isOverlappingPath({ rules: RULES, path: '/a/b', otherPath: '/a/bc' })).toBe(false);
    expect(isOverlappingPath({ rules: RULES, path: '/a/bc', otherPath: '/a/b' })).toBe(false);
  });
});
