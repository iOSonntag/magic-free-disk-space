import { describe, expect, test } from 'bun:test';
import { WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { CandidateDecision } from '../../src/scan/candidate.js';
import { decideRecycleBinCandidate } from '../../src/scan/decideRecycleBinCandidate.js';
import type { RecycleBinDescription } from '../../src/scan/scanPlatform.js';
import { buildTestDriveRoot } from '../support/parsedValueFixtures.js';

const MB = 1_000_000;

const recycleBin: RecycleBinDescription = {
  title: 'Example Bin',
  explanation: 'Files deleted on an example drive.',
  regeneration: 'A deleted file of the example does not come back.',
  risk: 'review',
  binFolderName: '$Recycle.Bin',
};

const driveRoot = buildTestDriveRoot({ text: 'D:\\' });

function decide(params: { sizeBytes: number; itemCount: number }): CandidateDecision[] {
  return decideRecycleBinCandidate({
    pathRules: WIN32_PATH_RULES,
    recycleBin: recycleBin,
    driveRoot: driveRoot,
    content: { sizeBytes: params.sizeBytes, itemCount: params.itemCount },
    minOfferedBytes: 10 * MB,
  });
}

describe('decideRecycleBinCandidate', () => {
  test('offers the bin of a drive as one item at its folder, named by its drive, as its description says', () => {
    expect(decide({ sizeBytes: 50 * MB, itemCount: 3 })).toEqual([
      {
        kind: 'offer',
        candidate: {
          path: 'D:\\$Recycle.Bin',
          title: 'Example Bin (D:)',
          category: 'trash',
          risk: 'review',
          origin: { kind: 'recycleBin' },
          explanation: 'Files deleted on an example drive.',
          regeneration: 'A deleted file of the example does not come back.',
          allocatedBytes: 50 * MB,
          entryCount: 3,
          isComplete: true,
          privateSizeFallbackCount: 0,
          lastUsedAtMs: null,
          downloadedAtMs: null,
          appName: null,
          removal: {
            kind: 'emptyRecycleBin',
            driveRoot: driveRoot,
            scannedContent: { sizeBytes: 50 * MB, itemCount: 3 },
          },
        },
      },
    ]);
  });

  test('takes the folder of the bin from its description', () => {
    expect(
      decideRecycleBinCandidate({
        pathRules: WIN32_PATH_RULES,
        recycleBin: { ...recycleBin, binFolderName: 'RECYCLER' },
        driveRoot: driveRoot,
        content: { sizeBytes: MB, itemCount: 1 },
        minOfferedBytes: 10 * MB,
      }),
    ).toEqual([{ kind: 'skip', path: 'D:\\RECYCLER', reason: 'belowSizeThreshold' }]);
  });

  test('skips a bin below the size an item needs, at its folder', () => {
    expect(decide({ sizeBytes: MB, itemCount: 2 })).toEqual([
      { kind: 'skip', path: 'D:\\$Recycle.Bin', reason: 'belowSizeThreshold' },
    ]);
  });

  test('makes no item of an empty bin, whatever size it reports', () => {
    expect(decide({ sizeBytes: 0, itemCount: 0 })).toEqual([]);
    expect(decide({ sizeBytes: 50 * MB, itemCount: 0 })).toEqual([]);
  });
});
