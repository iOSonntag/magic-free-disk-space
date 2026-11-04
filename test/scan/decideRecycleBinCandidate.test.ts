import { describe, expect, test } from 'bun:test';
import { WIN32_PATH_RULES } from '../../src/platform/win32/loadEnvironment.js';
import { decideRecycleBinCandidate } from '../../src/scan/decideRecycleBinCandidate.js';
import type { ScanPlatformTrashRecycleBins } from '../../src/scan/scanPlatform.js';
import { buildTestWindowsPath } from '../support/parsedValueFixtures.js';

const MIB = 1_048_576;

const TRASH: ScanPlatformTrashRecycleBins = {
  kind: 'recycleBins',
  title: 'Recycle Bin',
  explanation: 'Files you deleted on this drive.',
  regeneration: 'A deleted file does not come back.',
  risk: 'careful',
  loadRecycleBin: () => ({ kind: 'failed', failure: 'not read in this test' }),
};

const DRIVE_ROOT_PATH = buildTestWindowsPath({ text: 'D:\\' });

function decide(params: { sizeBytes: number; itemCount: number }) {
  return decideRecycleBinCandidate({
    pathRules: WIN32_PATH_RULES,
    trash: TRASH,
    driveRootPath: DRIVE_ROOT_PATH,
    content: { sizeBytes: params.sizeBytes, itemCount: params.itemCount },
    minOfferedBytes: 10 * MIB,
  });
}

describe('decideRecycleBinCandidate', () => {
  test('offers the bin of a drive as one item at its folder, named by its drive', () => {
    expect(decide({ sizeBytes: 50 * MIB, itemCount: 3 })).toEqual([
      {
        kind: 'offer',
        candidate: {
          path: 'D:\\$Recycle.Bin',
          title: 'Recycle Bin (D:)',
          category: 'trash',
          risk: 'careful',
          origin: { kind: 'recycleBin' },
          explanation: TRASH.explanation,
          regeneration: TRASH.regeneration,
          allocatedBytes: 50 * MIB,
          entryCount: 3,
          isComplete: true,
          privateSizeFallbackCount: 0,
          lastUsedAtMs: null,
          downloadedAtMs: null,
          appName: null,
          removal: {
            kind: 'emptyRecycleBin',
            driveRootPath: DRIVE_ROOT_PATH,
            scannedContent: { sizeBytes: 50 * MIB, itemCount: 3 },
          },
        },
      },
    ]);
  });

  test('skips a bin below the size an item needs, at its folder', () => {
    expect(decide({ sizeBytes: MIB, itemCount: 2 })).toEqual([
      { kind: 'skip', path: 'D:\\$Recycle.Bin', reason: 'belowSizeThreshold' },
    ]);
  });

  test('makes no item of an empty bin, whatever size it reports', () => {
    expect(decide({ sizeBytes: 0, itemCount: 0 })).toEqual([]);
    expect(decide({ sizeBytes: 50 * MIB, itemCount: 0 })).toEqual([]);
  });
});
