import { describe, expect, test } from 'bun:test';
import type {
  RemovalOutcomeCoded,
  RemovalOutcomeCodedKind,
  RemovalOutcomePartlyRemoved,
  RemovalOutcomeToolFailed,
} from '../../src/delete/deleteCandidates.js';
import { formatAvailableSpaceLine, formatRemovalRun } from '../../src/report/formatRemovalRun.js';
import {
  buildTestCandidate,
  buildTestEngineCandidate,
  buildTestRemovalOutcome,
} from '../support/candidateFixtures.js';

describe('formatRemovalRun', () => {
  test('reports an empty run as nothing freed', () => {
    const lines = formatRemovalRun({ run: { outcomes: [], journalFailure: null } });

    expect(lines).toEqual(['Freed about 0 B in 0 items.']);
  });

  test('lists each outcome with its code and counts only the freed bytes', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          buildPathOutcome({ path: '/fixture/a', outcome: 'removed', freedBytes: 1024 }),
          buildPathOutcome({ path: '/fixture/b', outcome: 'alreadyGone', freedBytes: 0 }),
          buildPathOutcome({ path: '/fixture/c', outcome: 'changedSinceScan', freedBytes: 0 }),
          buildPathOutcome({
            path: '/fixture/d',
            outcome: 'permissionDenied',
            freedBytes: 0,
            code: 'EACCES',
          }),
          buildPathOutcome({ path: '/fixture/e', outcome: 'failed', freedBytes: 0, code: 'EIO' }),
          buildPathOutcome({ path: '/fixture/f', outcome: 'notAttempted', freedBytes: 0 }),
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
      'Freed about 1.0 KB in 1 item.',
      '2 items could not be deleted.',
      '1 item was not attempted.',
    ]);
  });

  test('reports the folders of path units as paths, deleted or left alone', () => {
    const extensionsPath = '/Users/example/.vscode/extensions';
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          buildPathOutcome({
            path: `${extensionsPath}/example.alpha-1.0.0`,
            outcome: 'removed',
            freedBytes: 4096,
          }),
          buildPathOutcome({
            path: `${extensionsPath}/example.beta-2.0.0-darwin-arm64`,
            outcome: 'changedSinceScan',
            freedBytes: 0,
          }),
          buildPathOutcome({
            path: `${extensionsPath}/example.gamma-3.0.0`,
            outcome: 'ownerRunning',
            freedBytes: 0,
          }),
        ],
        journalFailure: null,
      },
    });

    expect(lines).toEqual([
      `- deleted: ${extensionsPath}/example.alpha-1.0.0`,
      `- changed since the scan, left alone: ${extensionsPath}/example.beta-2.0.0-darwin-arm64`,
      `- its app or tool is running now, left alone: ${extensionsPath}/example.gamma-3.0.0`,
      'Freed about 4.1 KB in 1 item.',
    ]);
  });

  test('counts what an engine freed apart, as space its disk image gives back within minutes', () => {
    const cleaned = buildTestEngineCandidate({ homeDir: '/fixture', allocatedBytes: 5000 });
    const inUse = buildTestEngineCandidate({ homeDir: '/fixture/other', allocatedBytes: 7000 });
    const stopped = buildTestEngineCandidate({ homeDir: '/fixture/third', allocatedBytes: 9000 });
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          buildPathOutcome({ path: '/fixture/a', outcome: 'removed', freedBytes: 1000 }),
          buildTestRemovalOutcome({ candidate: cleaned, outcome: 'removed', freedBytes: 5000 }),
          buildTestRemovalOutcome({ candidate: inUse, outcome: 'engineInUse', freedBytes: 0 }),
          buildTestRemovalOutcome({
            candidate: stopped,
            outcome: 'engineNotRunning',
            freedBytes: 0,
          }),
        ],
        journalFailure: null,
      },
    });

    expect(lines).toEqual([
      '- deleted: /fixture/a',
      '- deleted: Docker Desktop build cache, in Docker Desktop',
      '- its engine still uses it, left alone: Docker Desktop build cache, in Docker Desktop',
      '- its engine is not running, left alone: Docker Desktop build cache, in Docker Desktop',
      'Freed about 1.0 KB in 1 item.',
      'About 5.0 KB more comes back within minutes, once the container engines give up the space of their disk images.',
    ]);
  });

  test('names an engine item by its unit and its engine, never by the disk image its engine keeps', () => {
    const cleaned = buildTestEngineCandidate({ homeDir: '/fixture', allocatedBytes: 5000 });
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          buildTestRemovalOutcome({ candidate: cleaned, outcome: 'removed', freedBytes: 5000 }),
        ],
        journalFailure: null,
      },
    });

    expect(lines.some((line) => line.includes(cleaned.path))).toBe(false);
    expect(lines[0]).toBe('- deleted: Docker Desktop build cache, in Docker Desktop');
  });

  test('names how many entries of a partly deleted item stayed, counts what it freed, and counts it as not deleted', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          buildPartlyRemovedOutcome({
            path: 'C:\\fixture\\cache',
            freedBytes: 6144,
            stayedEntryCount: 2,
          }),
          buildPartlyRemovedOutcome({
            path: 'C:\\fixture\\held',
            freedBytes: 0,
            stayedEntryCount: 1,
          }),
        ],
        journalFailure: null,
      },
    });

    expect(lines).toEqual([
      '- partly deleted: C:\\fixture\\cache (2 entries stayed, in use by another program, kept only online, or refused by Windows; 6.1 KB freed)',
      '- partly deleted: C:\\fixture\\held (1 entry stayed, in use by another program, kept only online, or refused by Windows; 0 B freed)',
      'Freed about 6.1 KB in 0 items.',
      '2 items could not be deleted.',
    ]);
  });

  test('omits the summary lines that do not apply', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          buildPathOutcome({ path: '/fixture/a', outcome: 'removed', freedBytes: 2048 }),
          buildPathOutcome({ path: '/fixture/b', outcome: 'alreadyGone', freedBytes: 0 }),
        ],
        journalFailure: null,
      },
    });

    expect(lines).toEqual([
      '- deleted: /fixture/a',
      '- already gone: /fixture/b',
      'Freed about 2.0 KB in 1 item.',
    ]);
  });

  test('names the failure of a tool, each line of its stderr tail, and counts what it freed', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          buildPathOutcome({ path: '/fixture/tool-a', outcome: 'removed', freedBytes: 3072 }),
          buildToolFailedOutcome({
            path: '/fixture/tool-b',
            freedBytes: 1024,
            failure: {
              reason: 'commandFailed',
              failure: {
                reason: 'exitedWithError',
                exitCode: 2,
                stderrTail: 'device busy\n\n  try again later\n',
              },
            },
          }),
          buildToolFailedOutcome({
            path: '/fixture/tool-c',
            freedBytes: 0,
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'timedOut', timeoutMs: 600_000, stderrTail: 'still deleting' },
            },
          }),
          buildToolFailedOutcome({
            path: '/fixture/tool-d',
            freedBytes: 0,
            failure: { reason: 'outputUnreadable', detail: 'no device list' },
          }),
          buildPathOutcome({ path: '/fixture/tool-e', outcome: 'ownerRunning', freedBytes: 0 }),
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
      'Freed about 4.1 KB in 1 item.',
      '3 items could not be deleted.',
    ]);
  });

  test('names a signal, a spawn failure, and a too large output', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          buildToolFailedOutcome({
            path: '/fixture/a',
            freedBytes: 0,
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'endedBySignal', signal: 'SIGKILL', stderrTail: '' },
            },
          }),
          buildToolFailedOutcome({
            path: '/fixture/b',
            freedBytes: 0,
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'spawnFailed', message: 'ENOENT' },
            },
          }),
          buildToolFailedOutcome({
            path: '/fixture/c',
            freedBytes: 0,
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'outputTooLarge', maxOutputBytes: 1024 ** 2, stderrTail: '' },
            },
          }),
        ],
        journalFailure: null,
      },
    });

    expect(lines.slice(0, 3)).toEqual([
      '- its tool failed: /fixture/a (ended by signal SIGKILL)',
      '- its tool failed: /fixture/b (could not start: ENOENT)',
      '- its tool failed: /fixture/c (stopped when its output passed 1.0 MB)',
    ]);
  });

  test('names the file a recheck could not read, with its code and no stderr', () => {
    const lines = formatRemovalRun({
      run: {
        outcomes: [
          buildToolFailedOutcome({
            path: '/fixture/avd',
            freedBytes: 0,
            failure: {
              reason: 'fileUnreadable',
              path: '/fixture/avd/config.ini',
              failure: { reason: 'permissionDenied', code: 'EACCES' },
            },
          }),
        ],
        journalFailure: null,
      },
    });

    expect(lines[0]).toBe(
      '- its tool failed: /fixture/avd (could not read /fixture/avd/config.ini: EACCES)',
    );
    expect(lines[1]).toBe('Freed about 0 B in 0 items.');
  });

  test('names the free space of the disk after a run', () => {
    expect(formatAvailableSpaceLine({ availableBytes: 52_000_000_000 })).toBe(
      '52 GB is free on this disk now.',
    );
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

/** The outcome of an item at `path` deleted as its one target. */
function buildPathOutcome(params: {
  path: string;
  outcome: RemovalOutcomeCodedKind;
  freedBytes: number;
  code?: string;
}): RemovalOutcomeCoded {
  return buildTestRemovalOutcome({
    candidate: buildTestCandidate({ path: params.path }),
    outcome: params.outcome,
    freedBytes: params.freedBytes,
    code: params.code ?? null,
  });
}

function buildPartlyRemovedOutcome(params: {
  path: string;
  freedBytes: number;
  stayedEntryCount: number;
}): RemovalOutcomePartlyRemoved {
  return {
    candidate: buildTestCandidate({ path: params.path }),
    freedBytes: params.freedBytes,
    outcome: 'partlyRemoved',
    stayedEntryCount: params.stayedEntryCount,
  };
}

function buildToolFailedOutcome(params: {
  path: string;
  freedBytes: number;
  failure: RemovalOutcomeToolFailed['failure'];
}): RemovalOutcomeToolFailed {
  return {
    candidate: buildTestCandidate({ path: params.path }),
    freedBytes: params.freedBytes,
    outcome: 'toolFailed',
    failure: params.failure,
  };
}
