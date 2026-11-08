import { describe, expect, test } from 'bun:test';
import { formatEntryCallFailure } from '../../../src/platform/win32/formatEntryCallFailure.js';

describe('formatEntryCallFailure', () => {
  test('names not found, access denied, and a sharing or lock violation as Bun does', () => {
    const namesByCode: [number, string][] = [
      [2, 'ENOENT'],
      [3, 'ENOENT'],
      [5, 'EPERM'],
      [32, 'EBUSY'],
      [33, 'EBUSY'],
    ];

    for (const [code, name] of namesByCode) {
      expect(formatEntryCallFailure({ failure: { call: 'GetFileAttributesW', code: code } })).toBe(
        name,
      );
    }
  });

  test('names any other code by its call and its code in hex, as every failed call reads', () => {
    expect(formatEntryCallFailure({ failure: { call: 'SetFileAttributesW', code: 87 } })).toBe(
      'SetFileAttributesW failed with 0x00000057',
    );
  });
});
