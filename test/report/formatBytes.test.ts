import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatBytes, formatSizeText, formatTotalSizeText } from '../../src/report/formatBytes.js';
import { isJsonObject } from '../../src/system/parseJsonValue.js';

/** One count and its text, shared with the app's tests so both word a size alike. */
type FormatBytesCase = { bytes: number; text: string };

const FORMAT_BYTES_CASES = parseFormatBytesCases(
  JSON.parse(readFileSync(join(import.meta.dir, 'formatBytesCases.json'), 'utf8')),
);

function parseFormatBytesCases(value: unknown): FormatBytesCase[] {
  if (!Array.isArray(value)) {
    throw new Error('formatBytesCases.json must hold an array of cases.');
  }

  return value.map((item: unknown) => {
    if (!isJsonObject(item) || typeof item.bytes !== 'number' || typeof item.text !== 'string') {
      throw new Error(
        `A case of formatBytesCases.json is not { bytes, text }: ${JSON.stringify(item)}`,
      );
    }

    return { bytes: item.bytes, text: item.text };
  });
}

describe('formatBytes', () => {
  test.each(FORMAT_BYTES_CASES)('shows $bytes bytes as $text', (formatCase) => {
    expect(formatBytes(formatCase.bytes)).toBe(formatCase.text);
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
    expect(formatSizeText({ allocatedBytes: 1500, isComplete: true })).toBe('1.5 KB');
  });

  test('prefixes an incomplete size with at least', () => {
    expect(formatSizeText({ allocatedBytes: 1500, isComplete: false })).toBe('at least 1.5 KB');
  });
});

describe('formatTotalSizeText', () => {
  test('adds up the sizes of complete items', () => {
    const items = [
      { allocatedBytes: 1000, isComplete: true },
      { allocatedBytes: 500, isComplete: true },
    ];

    expect(formatTotalSizeText({ items: items })).toBe('1.5 KB');
  });

  test('reads at least when any item is incomplete', () => {
    const items = [
      { allocatedBytes: 1000, isComplete: true },
      { allocatedBytes: 500, isComplete: false },
    ];

    expect(formatTotalSizeText({ items: items })).toBe('at least 1.5 KB');
  });

  test('gives zero bytes for no item', () => {
    expect(formatTotalSizeText({ items: [] })).toBe('0 B');
  });
});
