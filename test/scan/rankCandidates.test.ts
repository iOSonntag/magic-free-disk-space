import { describe, expect, test } from 'bun:test';
import { rankBySize } from '../../src/scan/rankCandidates.js';

describe('rankBySize', () => {
  test('orders items by allocated bytes, largest first', () => {
    const small = { path: '/a/small', allocatedBytes: 10 };
    const medium = { path: '/a/medium', allocatedBytes: 50 };
    const large = { path: '/a/large', allocatedBytes: 300 };

    expect(rankBySize({ items: [small, large, medium] })).toEqual([large, medium, small]);
  });

  test('orders equal sizes by path with plain comparison', () => {
    const upperCase = { path: '/a/B', allocatedBytes: 10 };
    const lowerCase = { path: '/a/a', allocatedBytes: 10 };
    const last = { path: '/a/z', allocatedBytes: 10 };

    expect(rankBySize({ items: [last, lowerCase, upperCase] })).toEqual([
      upperCase,
      lowerCase,
      last,
    ]);
  });

  test('returns a new array and leaves the input in its order', () => {
    const large = { path: '/a/large', allocatedBytes: 300 };
    const small = { path: '/a/small', allocatedBytes: 10 };
    const items = [small, large];
    const itemsBefore = [...items];

    const ranked = rankBySize({ items });

    expect(ranked).toEqual([large, small]);
    expect(ranked).not.toBe(items);
    expect(items).toEqual(itemsBefore);
  });
});
