import { describe, expect, test } from 'bun:test';
import { formatCount } from '../../src/report/formatCount.js';

describe('formatCount', () => {
  test('uses the singular for one and the plural otherwise', () => {
    expect(formatCount({ count: 1, singular: 'item', plural: 'items' })).toBe('1 item');
    expect(formatCount({ count: 0, singular: 'item', plural: 'items' })).toBe('0 items');
    expect(formatCount({ count: 12, singular: 'item', plural: 'items' })).toBe('12 items');
  });
});
