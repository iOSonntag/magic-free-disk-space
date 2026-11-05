import { describe, expect, test } from 'bun:test';
import { formatBytes, formatSizeText, formatTotalSizeText } from '../../src/report/formatBytes.js';

describe('formatBytes', () => {
  test('shows counts under one kB in bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  test('shows one decimal below ten of a unit and a whole number from ten up', () => {
    expect(formatBytes(1000)).toBe('1.0 kB');
    expect(formatBytes(1500)).toBe('1.5 kB');
    expect(formatBytes(9500)).toBe('9.5 kB');
    expect(formatBytes(10_000)).toBe('10 kB');
    expect(formatBytes(10_000_000)).toBe('10 MB');
  });

  test('counts in powers of 1000, as macOS shows disk space', () => {
    expect(formatBytes(1024)).toBe('1.0 kB');
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.1 GB');
  });

  test('moves up a unit at each step of 1000, after rounding', () => {
    expect(formatBytes(999_600)).toBe('1.0 MB');
    expect(formatBytes(1_000_000_000)).toBe('1.0 GB');
    expect(formatBytes(2_254_857_830)).toBe('2.3 GB');
    expect(formatBytes(2 * 1000 ** 4)).toBe('2.0 TB');
  });

  test('keeps TB as the largest unit', () => {
    expect(formatBytes(1000 ** 5)).toBe('1000 TB');
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
    expect(formatSizeText({ allocatedBytes: 1500, isComplete: true })).toBe('1.5 kB');
  });

  test('prefixes an incomplete size with at least', () => {
    expect(formatSizeText({ allocatedBytes: 1500, isComplete: false })).toBe('at least 1.5 kB');
  });
});

describe('formatTotalSizeText', () => {
  test('adds up the sizes of complete items', () => {
    const items = [
      { allocatedBytes: 1000, isComplete: true },
      { allocatedBytes: 500, isComplete: true },
    ];

    expect(formatTotalSizeText({ items: items })).toBe('1.5 kB');
  });

  test('reads at least when any item is incomplete', () => {
    const items = [
      { allocatedBytes: 1000, isComplete: true },
      { allocatedBytes: 500, isComplete: false },
    ];

    expect(formatTotalSizeText({ items: items })).toBe('at least 1.5 kB');
  });

  test('gives zero bytes for no item', () => {
    expect(formatTotalSizeText({ items: [] })).toBe('0 B');
  });
});
