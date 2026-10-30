import { describe, expect, test } from 'bun:test';
import { formatRemovalRun } from '../../src/report/formatRemovalRun.js';

describe('formatRemovalRun', () => {
  test('reports an empty run as nothing freed', () => {
    const lines = formatRemovalRun({ run: { outcomes: [], journalFailure: null } });

    expect(lines).toEqual(['Freed about 0 B in 0 items.']);
  });

  test('lists each outcome with its code and counts only the freed bytes', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          {
            path: '/fixture/a',
            allocatedBytes: 1024,
            freedBytes: 1024,
            outcome: 'removed',
            code: null,
          },
          {
            path: '/fixture/b',
            allocatedBytes: 0,
            freedBytes: 0,
            outcome: 'alreadyGone',
            code: null,
          },
          {
            path: '/fixture/c',
            allocatedBytes: 0,
            freedBytes: 0,
            outcome: 'changedSinceScan',
            code: null,
          },
          {
            path: '/fixture/d',
            allocatedBytes: 5 * 1024 ** 2,
            freedBytes: 0,
            outcome: 'permissionDenied',
            code: 'EACCES',
          },
          {
            path: '/fixture/e',
            allocatedBytes: 5 * 1024 ** 2,
            freedBytes: 0,
            outcome: 'failed',
            code: 'EIO',
          },
          {
            path: '/fixture/f',
            allocatedBytes: 0,
            freedBytes: 0,
            outcome: 'notAttempted',
            code: null,
          },
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

  test('reports the folders of path units as paths, deleted or left alone', () => {
    const extensionsPath = '/Users/example/.vscode/extensions';
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          {
            path: `${extensionsPath}/example.alpha-1.0.0`,
            allocatedBytes: 4096,
            freedBytes: 4096,
            outcome: 'removed',
            code: null,
          },
          {
            path: `${extensionsPath}/example.beta-2.0.0-darwin-arm64`,
            allocatedBytes: 4096,
            freedBytes: 0,
            outcome: 'changedSinceScan',
            code: null,
          },
          {
            path: `${extensionsPath}/example.gamma-3.0.0`,
            allocatedBytes: 4096,
            freedBytes: 0,
            outcome: 'ownerRunning',
            code: null,
          },
        ],
        journalFailure: null,
      },
    });

    expect(lines).toEqual([
      `- deleted: ${extensionsPath}/example.alpha-1.0.0`,
      `- changed since the scan, left alone: ${extensionsPath}/example.beta-2.0.0-darwin-arm64`,
      `- its app or tool is running now, left alone: ${extensionsPath}/example.gamma-3.0.0`,
      'Freed about 4.0 KiB in 1 item.',
    ]);
  });

  test('omits the summary lines that do not apply', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          {
            path: '/fixture/a',
            allocatedBytes: 2048,
            freedBytes: 2048,
            outcome: 'removed',
            code: null,
          },
          {
            path: '/fixture/b',
            allocatedBytes: 0,
            freedBytes: 0,
            outcome: 'alreadyGone',
            code: null,
          },
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

  test('names the failure of a tool, each line of its stderr tail, and counts what it freed', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          {
            path: '/fixture/tool-a',
            allocatedBytes: 4096,
            freedBytes: 3072,
            outcome: 'removed',
            code: null,
          },
          {
            path: '/fixture/tool-b',
            allocatedBytes: 4096,
            freedBytes: 1024,
            outcome: 'toolFailed',
            failure: {
              reason: 'commandFailed',
              failure: {
                reason: 'exitedWithError',
                exitCode: 2,
                stderrTail: 'device busy\n\n  try again later\n',
              },
            },
          },
          {
            path: '/fixture/tool-c',
            allocatedBytes: 4096,
            freedBytes: 0,
            outcome: 'toolFailed',
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'timedOut', timeoutMs: 600_000, stderrTail: 'still deleting' },
            },
          },
          {
            path: '/fixture/tool-d',
            allocatedBytes: 4096,
            freedBytes: 0,
            outcome: 'toolFailed',
            failure: { reason: 'outputUnreadable', detail: 'no device list' },
          },
          {
            path: '/fixture/tool-e',
            allocatedBytes: 4096,
            freedBytes: 0,
            outcome: 'ownerRunning',
            code: null,
          },
        ],
        journalFailure: null,
      },
    });

    expect(lines).toEqual([
      '- deleted: /fixture/tool-a',
      '- its tool failed: /fixture/tool-b (exited with code 2)',
      '   device busy',
      '   try again later',
      '- its tool failed: /fixture/tool-c (stopped at its time limit of 600 s)',
      '   still deleting',
      '- its tool failed: /fixture/tool-d (its output could not be read: no device list)',
      '- its app or tool is running now, left alone: /fixture/tool-e',
      'Freed about 4.0 KiB in 1 item.',
      '3 items could not be deleted.',
    ]);
  });

  test('names a signal, a spawn failure, and a too large output', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          {
            path: '/fixture/a',
            allocatedBytes: 0,
            freedBytes: 0,
            outcome: 'toolFailed',
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'endedBySignal', signal: 'SIGKILL', stderrTail: '' },
            },
          },
          {
            path: '/fixture/b',
            allocatedBytes: 0,
            freedBytes: 0,
            outcome: 'toolFailed',
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'spawnFailed', message: 'ENOENT' },
            },
          },
          {
            path: '/fixture/c',
            allocatedBytes: 0,
            freedBytes: 0,
            outcome: 'toolFailed',
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'outputTooLarge', maxOutputBytes: 1024 ** 2, stderrTail: '' },
            },
          },
        ],
        journalFailure: null,
      },
    });

    expect(lines.slice(0, 3)).toEqual([
      '- its tool failed: /fixture/a (ended by signal SIGKILL)',
      '- its tool failed: /fixture/b (could not start: ENOENT)',
      '- its tool failed: /fixture/c (stopped when its output passed 1.0 MiB)',
    ]);
  });

  test('names the file a recheck could not read, with its code and no stderr', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          {
            path: '/fixture/avd',
            allocatedBytes: 0,
            freedBytes: 0,
            outcome: 'toolFailed',
            failure: {
              reason: 'fileUnreadable',
              path: '/fixture/avd/config.ini',
              failure: { reason: 'permissionDenied', code: 'EACCES' },
            },
          },
        ],
        journalFailure: null,
      },
    });

    expect(lines[0]).toBe(
      '- its tool failed: /fixture/avd (could not read /fixture/avd/config.ini: EACCES)',
    );
    expect(lines[1]).toBe('Freed about 0 B in 0 items.');
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
