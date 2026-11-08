import { describe, expect, test } from 'bun:test';
import { decideRecycleBinRecheck } from '../../src/delete/decideRecycleBinRecheck.js';
import type { RecycleBinContent } from '../../src/scan/candidate.js';

const SCANNED: RecycleBinContent = { sizeBytes: 8192, itemCount: 3 };

describe('decideRecycleBinRecheck', () => {
  test('keeps a bin unchanged that holds what the scan counted', () => {
    expect(decideRecycleBinRecheck({ scanned: SCANNED, current: { ...SCANNED } })).toBe(
      'unchanged',
    );
  });

  test('takes a bin that holds no item for already gone, whatever size it reports', () => {
    for (const current of [
      { sizeBytes: 0, itemCount: 0 },
      { sizeBytes: 4096, itemCount: 0 },
    ]) {
      expect(decideRecycleBinRecheck({ scanned: SCANNED, current: current })).toBe('alreadyGone');
    }
  });

  test('marks a bin changed whose items or size differ from the scan, either way', () => {
    for (const current of [
      { sizeBytes: 8192, itemCount: 4 },
      { sizeBytes: 8192, itemCount: 2 },
      { sizeBytes: 12_288, itemCount: 3 },
      { sizeBytes: 4096, itemCount: 3 },
    ]) {
      expect(decideRecycleBinRecheck({ scanned: SCANNED, current: current })).toBe(
        'changedSinceScan',
      );
    }
  });
});
