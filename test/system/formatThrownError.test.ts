import { describe, expect, test } from 'bun:test';
import { formatThrownError } from '../../src/system/formatThrownError.js';

describe('formatThrownError', () => {
  test('gives the message of an error', () => {
    expect(formatThrownError(new TypeError('the path is missing'))).toBe('the path is missing');
  });

  test('gives the text of any other thrown value', () => {
    expect(formatThrownError('plain text')).toBe('plain text');
    expect(formatThrownError(42)).toBe('42');
  });
});
