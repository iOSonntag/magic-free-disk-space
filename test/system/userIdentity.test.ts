import { describe, expect, test } from 'bun:test';
import type { Result } from '../../src/result.js';
import { parsePosixUid, parseWindowsSid } from '../../src/system/userIdentity.js';

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

describe('parseWindowsSid', () => {
  test('accepts the string form of a user, a well-known, and a hex-authority SID', () => {
    for (const text of ['S-1-5-21-1000-2000-3000-1001', 'S-1-5-18', 'S-1-0x00000000000F-1']) {
      const parsed: Result<string, string> = parseWindowsSid({ text: text });

      expect(parsed).toEqual({ kind: 'succeeded', value: text });
    }
  });

  test('refuses a text that is no SID in its string form', () => {
    for (const text of [
      '',
      's-1-5-18',
      'S-2-5-18',
      'S-1-5-',
      'S-1-5-18 ',
      'S-1-0x0f-1',
      `S-1-5${'-1'.repeat(16)}`,
    ]) {
      expect(parseWindowsSid({ text: text })).toEqual({
        kind: 'failed',
        failure: 'not a security identifier',
      });
    }
  });
});
