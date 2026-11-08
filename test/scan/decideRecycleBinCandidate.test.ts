import { describe, expect, test } from 'bun:test';
import { WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { CandidateDecision } from '../../src/scan/candidate.js';
import { decideRecycleBinCandidate } from '../../src/scan/decideRecycleBinCandidate.js';
import { buildTestRecycleBinCandidate } from '../support/candidateFixtures.js';
import { buildTestDriveRoot } from '../support/parsedValueFixtures.js';
import { getWin32RecycleBinScanTrash } from '../support/platformFixtures.js';

const MB = 1_000_000;

const recycleBinTrash = getWin32RecycleBinScanTrash();

const driveRoot = buildTestDriveRoot({ text: 'D:\\' });

function decide(params: { sizeBytes: number; itemCount: number }): CandidateDecision[] {
  return decideRecycleBinCandidate({
    pathRules: WIN32_PATH_RULES,
    trash: recycleBinTrash,
    driveRoot: driveRoot,
    content: { sizeBytes: params.sizeBytes, itemCount: params.itemCount },
    minOfferedBytes: 10 * MB,
  });
}

describe('decideRecycleBinCandidate', () => {
  test('offers the bin of a drive as one item at its folder, named by its drive', () => {
    const decisions = decide({ sizeBytes: 50 * MB, itemCount: 3 });

    expect(decisions).toEqual([
      {
        kind: 'offer',
        candidate: buildTestRecycleBinCandidate({
          driveRootText: 'D:\\',
          scannedContent: { sizeBytes: 50 * MB, itemCount: 3 },
        }),
      },
    ]);
    expect(decisions).toMatchObject([
      { candidate: { path: 'D:\\$Recycle.Bin', title: 'Recycle Bin (D:)' } },
    ]);
  });

  test('takes the folder of the bin from the platform', () => {
    expect(
      decideRecycleBinCandidate({
        pathRules: WIN32_PATH_RULES,
        trash: { ...recycleBinTrash, binFolderName: 'RECYCLER' },
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
