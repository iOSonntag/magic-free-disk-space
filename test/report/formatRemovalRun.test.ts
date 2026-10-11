import { describe, expect, test } from 'bun:test';
import { formatRemovalRun } from '../../src/report/formatRemovalRun.js';

describe('formatRemovalRun', () => {
  test('reports an empty run as nothing freed', () => {
    const lines = formatRemovalRun({ run: { outcomes: [], journalFailure: null } });

    expect(lines).toEqual(['Freed about 0 B in 0 items.']);
  });

  test('lists each outcome with its code and counts only the removed bytes', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          { path: '/fixture/a', allocatedBytes: 1024, outcome: 'removed', code: null },
          { path: '/fixture/b', allocatedBytes: 0, outcome: 'alreadyGone', code: null },
          { path: '/fixture/c', allocatedBytes: 0, outcome: 'changedSinceScan', code: null },
          {
            path: '/fixture/d',
            allocatedBytes: 5 * 1024 ** 2,
            outcome: 'permissionDenied',
            code: 'EACCES',
          },
          { path: '/fixture/e', allocatedBytes: 5 * 1024 ** 2, outcome: 'failed', code: 'EIO' },
          { path: '/fixture/f', allocatedBytes: 0, outcome: 'notAttempted', code: null },
        ],
        journalFailure: null,
      },
    });

    expect(lines).toEqual([
      '- deleted: /fixture/a',
      '- already gone: /fixture/b',
      '- changed since the scan, left alone: /fixture/c',
      '- permission denied: /fixture/d (EACCES)',
      '- failed: /fixture/e (EIO)',
      '- not attempted: /fixture/f',
      'Freed about 1.0 KiB in 1 item.',
      '2 items could not be deleted.',
      '1 item was not attempted.',
    ]);
  });

  test('omits the summary lines that do not apply', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          { path: '/fixture/a', allocatedBytes: 2048, outcome: 'removed', code: null },
          { path: '/fixture/b', allocatedBytes: 0, outcome: 'alreadyGone', code: null },
        ],
        journalFailure: null,
      },
    });

    expect(lines).toEqual([
      '- deleted: /fixture/a',
      '- already gone: /fixture/b',
      'Freed about 2.0 KiB in 1 item.',
    ]);
  });

  test('adds the deletion log failure as the last line', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [],
        journalFailure: { reason: 'writeFailed', path: '/fixture/log.jsonl', code: 'EIO' },
      },
    });

    expect(lines).toEqual([
      'Freed about 0 B in 0 items.',
      'The deletion log failed (writeFailed at /fixture/log.jsonl: EIO), so the run stopped.',
    ]);
  });
});
