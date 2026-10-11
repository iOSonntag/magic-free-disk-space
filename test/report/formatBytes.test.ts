import { describe, expect, test } from 'bun:test';
import { formatBytes, formatSizeText } from '../../src/report/formatBytes.js';

describe('formatBytes', () => {
  test('shows counts under one KiB in bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  test('shows one decimal below ten of a unit and a whole number from ten up', () => {
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatBytes(9728)).toBe('9.5 KiB');
    expect(formatBytes(10 * 1024)).toBe('10 KiB');
    expect(formatBytes(10 * 1024 ** 2)).toBe('10 MiB');
  });

  test('moves up a unit at each step of 1024', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GiB');
    expect(formatBytes(2_254_857_830)).toBe('2.1 GiB');
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.0 TiB');
  });

  test('keeps TiB as the largest unit', () => {
    expect(formatBytes(1024 ** 5)).toBe('1024 TiB');
  });

  test('throws for a negative, non-integer, or non-finite count', () => {
    expect(() => formatBytes(-1)).toThrow(RangeError);
    expect(() => formatBytes(1.5)).toThrow(RangeError);
    expect(() => formatBytes(Number.NaN)).toThrow(RangeError);
    expect(() => formatBytes(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('formatSizeText', () => {
  test('shows a complete size as formatBytes does', () => {
    expect(formatSizeText({ allocatedBytes: 1536, isComplete: true })).toBe('1.5 KiB');
  });

  test('prefixes an incomplete size with at least', () => {
    expect(formatSizeText({ allocatedBytes: 1536, isComplete: false })).toBe('at least 1.5 KiB');
  });
});
