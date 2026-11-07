import { describe, expect, test } from 'bun:test';
import { hasSamePaths } from '../../src/explore/hasSamePaths.js';

describe('hasSamePaths', () => {
  test('holds for the same paths in another order', () => {
    expect(hasSamePaths({ left: ['/a', '/b'], right: ['/b', '/a'] })).toBe(true);
  });

  test('fails when one side holds a path more or less', () => {
    expect(hasSamePaths({ left: ['/a', '/b'], right: ['/a'] })).toBe(false);
    expect(hasSamePaths({ left: ['/a'], right: ['/a', '/b'] })).toBe(false);
    expect(hasSamePaths({ left: ['/a', '/b'], right: ['/a', '/c'] })).toBe(false);
  });

  test('compares whole paths, never a prefix', () => {
    expect(hasSamePaths({ left: ['/a/b'], right: ['/a/b/'] })).toBe(false);
    expect(hasSamePaths({ left: ['/a/b'], right: ['/a/bc'] })).toBe(false);
  });
});
