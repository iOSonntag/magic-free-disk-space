import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDeletionJournal, formatJournalLine } from '../../src/delete/deletionJournal.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';

/** The permission bits of a mode, without the bits of its file type. */
const PERMISSION_BITS = 0o777;

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

describe('formatJournalLine', () => {
  test('writes one JSON object per line', () => {
    expect(formatJournalLine({ entry: { kind: 'sessionStart', atMs: 5 } })).toBe(
      '{"kind":"sessionStart","atMs":5}\n',
    );
  });
});

describe('createDeletionJournal', () => {
  test('creates the log folder, records the session start, and appends entries', async () => {
    const logPath = join(fixtureRoot.homeDir, 'Library/Logs/magic-free-disk-space/deletions.jsonl');
    const journal = await createDeletionJournal({
      logPath: logPath,
      ownerOnlyModes: null,
      nowMs: 100,
    });

    if (journal.kind === 'failed') {
      throw new Error(`Journal failed: ${journal.failure.reason}`);
    }

    const appended = await journal.value.append({
      entry: { kind: 'intent', atMs: 101, path: '/x', allocatedBytes: 4096, targetPaths: ['/x'] },
    });
    const lines = (await readFile(logPath, 'utf8')).trimEnd().split('\n');

    expect(appended.kind).toBe('succeeded');
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { kind: 'sessionStart', atMs: 100 },
      { kind: 'intent', atMs: 101, path: '/x', allocatedBytes: 4096, targetPaths: ['/x'] },
    ]);
  });

  test('keeps the lines of an earlier session', async () => {
    const logPath = join(fixtureRoot.homeDir, 'deletions.jsonl');

    await createDeletionJournal({ logPath: logPath, ownerOnlyModes: null, nowMs: 1 });
    await createDeletionJournal({ logPath: logPath, ownerOnlyModes: null, nowMs: 2 });

    expect((await readFile(logPath, 'utf8')).trimEnd().split('\n')).toHaveLength(2);
  });

  testOnPosix('creates the log folder and the log with the owner-only modes', async () => {
    const logDirectory = join(fixtureRoot.homeDir, 'Logs');
    const logPath = join(logDirectory, 'deletions.jsonl');

    await createDeletionJournal({
      logPath: logPath,
      ownerOnlyModes: { directoryMode: 0o700, fileMode: 0o600 },
      nowMs: 1,
    });

    expect((await stat(logDirectory)).mode & PERMISSION_BITS).toBe(0o700);
    expect((await stat(logPath)).mode & PERMISSION_BITS).toBe(0o600);
  });

  testOnPosix('creates the log folder and the log with the defaults for no modes', async () => {
    const logDirectory = join(fixtureRoot.homeDir, 'Logs');
    const logPath = join(logDirectory, 'deletions.jsonl');
    const umask = process.umask();

    await createDeletionJournal({ logPath: logPath, ownerOnlyModes: null, nowMs: 1 });

    expect((await stat(logDirectory)).mode & PERMISSION_BITS).toBe(0o777 & ~umask);
    expect((await stat(logPath)).mode & PERMISSION_BITS).toBe(0o666 & ~umask);
  });

  test('fails with directoryUnavailable when a file stands where the folder belongs', async () => {
    const blockingFile = join(fixtureRoot.homeDir, 'Logs');

    await writeFile(blockingFile, 'not a folder');

    const journal = await createDeletionJournal({
      logPath: join(blockingFile, 'deletions.jsonl'),
      ownerOnlyModes: null,
      nowMs: 1,
    });

    expect(journal).toMatchObject({ kind: 'failed', failure: { reason: 'directoryUnavailable' } });
  });

  testOnPosix('fails with cannotOpen when the log folder is not writable', async () => {
    const logDirectory = join(fixtureRoot.homeDir, 'read-only-logs');

    await mkdir(logDirectory);
    await chmod(logDirectory, 0o500);

    const journal = await createDeletionJournal({
      logPath: join(logDirectory, 'deletions.jsonl'),
      ownerOnlyModes: null,
      nowMs: 1,
    });

    expect(journal).toMatchObject({
      kind: 'failed',
      failure: { reason: 'cannotOpen', code: 'EACCES' },
    });
  });

  testOnPosix('an append fails once the log file became read-only', async () => {
    const logPath = join(fixtureRoot.homeDir, 'deletions.jsonl');
    const journal = await createDeletionJournal({
      logPath: logPath,
      ownerOnlyModes: null,
      nowMs: 1,
    });

    if (journal.kind === 'failed') {
      throw new Error(`Journal failed: ${journal.failure.reason}`);
    }

    await chmod(logPath, 0o400);

    const appended = await journal.value.append({ entry: { kind: 'sessionStart', atMs: 2 } });

    expect(appended).toMatchObject({ kind: 'failed', failure: { reason: 'cannotOpen' } });
  });
});
