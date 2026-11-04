import { describe, expect, test } from 'bun:test';
import type { Result } from '../../src/result.js';
import { parsePosixUid } from '../../src/system/userIdentity.js';

describe('parsePosixUid', () => {
  test('accepts a non-negative integer, root among them', () => {
    const root: Result<number, string> = parsePosixUid({ value: 0 });
    const user: Result<number, string> = parsePosixUid({ value: 501 });

    expect(root).toEqual({ kind: 'succeeded', value: 0 });
    expect(user).toEqual({ kind: 'succeeded', value: 501 });
  });

  test('refuses a negative, a fractional, and a non-finite value', () => {
    for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parsePosixUid({ value: value })).toEqual({
        kind: 'failed',
        failure: 'not a non-negative integer',
      });
    }
  });
});
