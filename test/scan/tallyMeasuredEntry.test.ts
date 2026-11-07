import { expect, test } from 'bun:test';
import type { EntryTallyTotals, MeasuredEntry } from '../../src/scan/tallyMeasuredEntry.js';
import {
  createEntryTally,
  getEntryTallyTotals,
  tallyMeasuredEntry,
} from '../../src/scan/tallyMeasuredEntry.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';

const DEV = 16_777_232n;

function buildFileEntry(params: {
  ino: bigint;
  linkCount: number;
  allocatedBytes: number;
  privateBytes: number | null;
}): MeasuredEntry {
  return {
    kind: 'file',
    dev: DEV,
    ino: params.ino,
    allocatedBytes: params.allocatedBytes,
    linkCount: params.linkCount,
    privateBytes: params.privateBytes,
  };
}

/** Folds the entries of each path in turn into one tally, as one offer of those paths does. */
function tallyOfferPaths(paths: MeasuredEntry[][]): EntryTallyTotals {
  const tally = createEntryTally();

  for (const pathEntries of paths) {
    for (const entry of pathEntries) {
      tallyMeasuredEntry({ tally: tally, entry: entry });
    }
  }

  return getEntryTallyTotals(tally);
}

describeAwaitingWin32Platform('tallyMeasuredEntry', () => {
  test('counts a single-link file by its private size', () => {
    const totals = tallyOfferPaths([
      [buildFileEntry({ ino: 1n, linkCount: 1, allocatedBytes: 1_048_576, privateBytes: 16_384 })],
    ]);

    expect(totals).toEqual({ countedBytes: 16_384, privateSizeFallbackCount: 0 });
  });

  test('counts the allocated blocks of a file whose private read failed, and the fallback', () => {
    const totals = tallyOfferPaths([
      [buildFileEntry({ ino: 1n, linkCount: 1, allocatedBytes: 8192, privateBytes: null })],
    ]);

    expect(totals).toEqual({ countedBytes: 8192, privateSizeFallbackCount: 1 });
  });

  test('counts a folder by its allocated blocks', () => {
    const totals = tallyOfferPaths([[{ kind: 'directory', allocatedBytes: 4096 }]]);

    expect(totals).toEqual({ countedBytes: 4096, privateSizeFallbackCount: 0 });
  });

  test('counts an inode once when the offer holds both of its links', () => {
    const totals = tallyOfferPaths([
      [
        buildFileEntry({ ino: 7n, linkCount: 2, allocatedBytes: 102_400, privateBytes: 102_400 }),
        buildFileEntry({ ino: 7n, linkCount: 2, allocatedBytes: 102_400, privateBytes: 102_400 }),
      ],
    ]);

    expect(totals).toEqual({ countedBytes: 102_400, privateSizeFallbackCount: 0 });
  });

  test('counts nothing for a link whose other link lies outside the offer', () => {
    const totals = tallyOfferPaths([
      [buildFileEntry({ ino: 7n, linkCount: 2, allocatedBytes: 102_400, privateBytes: 102_400 })],
    ]);

    expect(totals).toEqual({ countedBytes: 0, privateSizeFallbackCount: 0 });
  });

  test('keeps inodes of the same number on two devices apart', () => {
    const tally = createEntryTally();

    tallyMeasuredEntry({
      tally: tally,
      entry: buildFileEntry({ ino: 7n, linkCount: 2, allocatedBytes: 4096, privateBytes: 4096 }),
    });
    tallyMeasuredEntry({
      tally: tally,
      entry: {
        kind: 'file',
        dev: DEV + 1n,
        ino: 7n,
        allocatedBytes: 4096,
        linkCount: 2,
        privateBytes: 4096,
      },
    });

    expect(getEntryTallyTotals(tally)).toEqual({ countedBytes: 0, privateSizeFallbackCount: 0 });
  });

  test('counts the fallback of a linked inode once, and only when the inode counts', () => {
    const counted = tallyOfferPaths([
      [
        buildFileEntry({ ino: 7n, linkCount: 2, allocatedBytes: 8192, privateBytes: null }),
        buildFileEntry({ ino: 7n, linkCount: 2, allocatedBytes: 8192, privateBytes: null }),
      ],
    ]);
    const uncounted = tallyOfferPaths([
      [buildFileEntry({ ino: 8n, linkCount: 3, allocatedBytes: 8192, privateBytes: null })],
    ]);

    expect(counted).toEqual({ countedBytes: 8192, privateSizeFallbackCount: 1 });
    expect(uncounted).toEqual({ countedBytes: 0, privateSizeFallbackCount: 0 });
  });

  test('sums a folder, single-link files and a complete linked inode', () => {
    const totals = tallyOfferPaths([
      [
        { kind: 'directory', allocatedBytes: 4096 },
        buildFileEntry({ ino: 1n, linkCount: 1, allocatedBytes: 8192, privateBytes: 0 }),
        buildFileEntry({ ino: 2n, linkCount: 1, allocatedBytes: 8192, privateBytes: 8192 }),
        buildFileEntry({ ino: 3n, linkCount: 2, allocatedBytes: 4096, privateBytes: 4096 }),
      ],
      [buildFileEntry({ ino: 3n, linkCount: 2, allocatedBytes: 4096, privateBytes: 4096 })],
    ]);

    expect(totals).toEqual({ countedBytes: 4096 + 0 + 8192 + 4096, privateSizeFallbackCount: 0 });
  });
});
