import { describe, expect, test } from 'bun:test';
import { listDriveRootTexts } from '../../../src/platform/win32/listDriveRootTexts.js';

describe('listDriveRootTexts', () => {
  test('lists the root of each drive whose bit is set, in letter order', () => {
    // Bits 2, 3, and 25: the drives C, D, and Z.
    expect(listDriveRootTexts({ logicalDrives: 0b10_0000_0000_0000_0000_0000_1100 })).toEqual([
      'C:\\',
      'D:\\',
      'Z:\\',
    ]);
  });

  test('lists drive A for bit 0 and no drive for an empty mask', () => {
    expect(listDriveRootTexts({ logicalDrives: 1 })).toEqual(['A:\\']);
    expect(listDriveRootTexts({ logicalDrives: 0 })).toEqual([]);
  });
});
