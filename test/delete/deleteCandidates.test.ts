import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, lstat, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { deleteCandidates, toolCandidateRunToRemoval } from '../../src/delete/deleteCandidates.js';
import type { DeletionJournal, JournalEntry } from '../../src/delete/deletionJournal.js';
import { createDeletionJournal } from '../../src/delete/deletionJournal.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { Candidate } from '../../src/scan/candidate.js';
import { loadFileIdentity } from '../../src/system/loadFileIdentity.js';
import { buildTestToolCandidate } from '../support/candidateFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';

const NOW_MS = Date.UTC(2026, 9, 1);

let fixtureRoot: FixtureRoot;
let environment: Environment;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function isPresent(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

/** Scans a fixture path the way the scanner does, so the candidate carries its real identity. */
async function scanCandidate(path: string, ownerBundlePaths: string[] = []): Promise<Candidate> {
  const identity = await loadFileIdentity({ path: path });

  if (identity.kind === 'failed') {
    throw new Error(`Cannot scan ${path}: ${identity.failure.reason}`);
  }

  return {
    path: path,
    title: 'Fixture item',
    category: 'caches',
    risk: 'safe',
    origin: 'catalog',
    explanation: 'A fixture.',
    regeneration: 'None.',
    allocatedBytes: 4096,
    entryCount: 1,
    isComplete: true,
    removal: { kind: 'deletePath', identity: identity.value, ownerBundlePaths: ownerBundlePaths },
    evidenceLines: [],
  };
}

async function createTestJournal(): Promise<DeletionJournal> {
  const journal = await createDeletionJournal({
    logPath: join(fixtureRoot.rootDir, 'deletions.jsonl'),
    nowMs: NOW_MS,
  });

  if (journal.kind === 'failed') {
    throw new Error(`Journal failed: ${journal.failure.reason}`);
  }

  return journal.value;
}

/** A journal that records the first `successCount` entries and then fails, as a full disk would. */
function buildFailingJournal(params: { inner: DeletionJournal; successCount: number }) {
  let appendCount = 0;
  const failingJournal: DeletionJournal = {
    logPath: params.inner.logPath,
    append: async (appendParams) => {
      appendCount += 1;

      if (appendCount > params.successCount) {
        return {
          kind: 'failed',
          failure: { reason: 'writeFailed', path: params.inner.logPath, code: 'ENOSPC' },
        };
      }

      return params.inner.append(appendParams);
    },
  };

  return failingJournal;
}

async function createCacheFolder(name: string): Promise<string> {
  const path = join(fixtureRoot.homeDir, 'Library/Caches', name);

  await mkdir(join(path, 'nested'), { recursive: true });
  await createFixtureFile({
    path: join(path, 'nested/blob.bin'),
    sizeBytes: 8192,
    modifiedMs: NOW_MS,
  });

  return path;
}

describe('deleteCandidates', () => {
  test('deletes exactly the given items and records intent before outcome', async () => {
    const selected = await createCacheFolder('selected');
    const sibling = await createCacheFolder('sibling');
    const journal = await createTestJournal();

    const run = await deleteCandidates({
      candidates: [await scanCandidate(selected)],
      journal: journal,
      processCommands: [],
      environment: environment,
      clock: () => NOW_MS,
    });
    const journalLines = (await readFile(journal.logPath, 'utf8'))
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(run).toEqual({
      outcomes: [
        { path: selected, allocatedBytes: 4096, freedBytes: 4096, outcome: 'removed', code: null },
      ],
      journalFailure: null,
    });
    expect(await isPresent(selected)).toBe(false);
    expect(await isPresent(join(sibling, 'nested/blob.bin'))).toBe(true);
    expect(journalLines.map((line) => line.kind)).toEqual(['sessionStart', 'intent', 'outcome']);
    expect(journalLines[2]).toMatchObject({ path: selected, outcome: 'removed' });
  });

  test('removes a symbolic link inside a deleted folder without touching its target', async () => {
    const selected = await createCacheFolder('with-link');
    const keptFolder = join(fixtureRoot.homeDir, 'Documents/important');
    const keptFile = join(keptFolder, 'thesis.txt');

    await mkdir(keptFolder, { recursive: true });
    await createFixtureFile({ path: keptFile, sizeBytes: 100, modifiedMs: NOW_MS });
    await symlink(keptFolder, join(selected, 'link-to-folder'));
    await symlink(keptFile, join(selected, 'link-to-file'));

    const run = await deleteCandidates({
      candidates: [await scanCandidate(selected)],
      journal: await createTestJournal(),
      processCommands: [],
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run.outcomes[0]?.outcome).toBe('removed');
    expect(await isPresent(selected)).toBe(false);
    expect(await readFile(keptFile, 'utf8')).toHaveLength(100);
  });

  test('leaves a folder alone that was replaced after the scan', async () => {
    const selected = await createCacheFolder('replaced');
    const scanned = await scanCandidate(selected);

    await rm(selected, { recursive: true });
    await createCacheFolder('replaced');

    const run = await deleteCandidates({
      candidates: [scanned],
      journal: await createTestJournal(),
      processCommands: [],
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'changedSinceScan', freedBytes: 0 });
    expect(await isPresent(join(selected, 'nested/blob.bin'))).toBe(true);
  });

  test('leaves a symbolic link alone that took the place of the scanned folder', async () => {
    const selected = await createCacheFolder('swapped');
    const target = await createCacheFolder('target');
    const scanned = await scanCandidate(selected);

    await rm(selected, { recursive: true });
    await symlink(target, selected);

    const run = await deleteCandidates({
      candidates: [scanned],
      journal: await createTestJournal(),
      processCommands: [],
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run.outcomes[0]?.outcome).toBe('changedSinceScan');
    expect(await isPresent(selected)).toBe(true);
    expect(await isPresent(join(target, 'nested/blob.bin'))).toBe(true);
  });

  test('reports an item that vanished as already gone and goes on', async () => {
    const vanished = await createCacheFolder('vanished');
    const next = await createCacheFolder('next');
    const candidates = [await scanCandidate(vanished), await scanCandidate(next)];

    await rm(vanished, { recursive: true });

    const run = await deleteCandidates({
      candidates: candidates,
      journal: await createTestJournal(),
      processCommands: [],
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual(['alreadyGone', 'removed']);
  });

  test('reports a permission denial, keeps the file, and goes on', async () => {
    const lockedFolder = join(fixtureRoot.homeDir, 'Downloads');
    const lockedFile = join(lockedFolder, 'locked.bin');
    const next = await createCacheFolder('after-locked');

    await mkdir(lockedFolder, { recursive: true });
    await createFixtureFile({ path: lockedFile, sizeBytes: 4096, modifiedMs: NOW_MS });

    const candidates = [await scanCandidate(lockedFile), await scanCandidate(next)];

    await chmod(lockedFolder, 0o500);

    const run = await deleteCandidates({
      candidates: candidates,
      journal: await createTestJournal(),
      processCommands: [],
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'permissionDenied', code: 'EACCES' });
    expect(run.outcomes[1]?.outcome).toBe('removed');
    expect(await isPresent(lockedFile)).toBe(true);
  });

  test('deletes nothing when the intent cannot be recorded', async () => {
    const first = await createCacheFolder('first');
    const second = await createCacheFolder('second');
    const journal = await createTestJournal();
    const candidates = [await scanCandidate(first), await scanCandidate(second)];

    await chmod(journal.logPath, 0o400);

    const run = await deleteCandidates({
      candidates: candidates,
      journal: journal,
      processCommands: [],
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run.journalFailure).toMatchObject({ reason: 'cannotOpen', code: 'EACCES' });
    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual([
      'notAttempted',
      'notAttempted',
    ]);
    expect(await isPresent(first)).toBe(true);
    expect(await isPresent(second)).toBe(true);
  });

  test('stops after the item whose outcome cannot be recorded', async () => {
    const first = await createCacheFolder('first');
    const second = await createCacheFolder('second');
    const candidates = [await scanCandidate(first), await scanCandidate(second)];
    const journal = buildFailingJournal({ inner: await createTestJournal(), successCount: 1 });

    const run = await deleteCandidates({
      candidates: candidates,
      journal: journal,
      processCommands: [],
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run.journalFailure).toMatchObject({ reason: 'writeFailed' });
    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual(['removed', 'notAttempted']);
    expect(await isPresent(first)).toBe(false);
    expect(await isPresent(second)).toBe(true);
  });

  test('leaves an item alone whose app started after the scan', async () => {
    const appCache = await createCacheFolder('app-cache');
    const ownerless = await createCacheFolder('ownerless');
    const candidates = [
      await scanCandidate(appCache, ['/Applications/Example.app']),
      await scanCandidate(ownerless),
    ];

    const run = await deleteCandidates({
      candidates: candidates,
      journal: await createTestJournal(),
      processCommands: ['/Applications/Example.app/Contents/MacOS/Example'],
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual(['ownerRunning', 'removed']);
    expect(await isPresent(join(appCache, 'nested/blob.bin'))).toBe(true);
  });

  test('withholds every owned item when the process list cannot be read', async () => {
    const appCache = await createCacheFolder('app-cache');
    const ownerless = await createCacheFolder('ownerless');
    const candidates = [
      await scanCandidate(appCache, ['/Applications/Example.app']),
      await scanCandidate(ownerless),
    ];

    const run = await deleteCandidates({
      candidates: candidates,
      journal: await createTestJournal(),
      processCommands: null,
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual(['ownerRunning', 'removed']);
    expect(await isPresent(appCache)).toBe(true);
  });

  test('records the tool intent first and runs no tool when it cannot be recorded', async () => {
    const pathItem = await createCacheFolder('after-tool');
    const toolCandidate = buildTestToolCandidate({
      homeDir: fixtureRoot.homeDir,
      version: '20.1.0',
    });
    const entries: JournalEntry[] = [];
    const journal: DeletionJournal = {
      logPath: join(fixtureRoot.rootDir, 'deletions.jsonl'),
      append: async (appendParams) => {
        entries.push(appendParams.entry);

        return {
          kind: 'failed',
          failure: { reason: 'writeFailed', path: 'deletions.jsonl', code: 'ENOSPC' },
        };
      },
    };

    const run = await deleteCandidates({
      candidates: [toolCandidate, await scanCandidate(pathItem)],
      journal: journal,
      environment: environment,
      processCommands: [],
      clock: () => NOW_MS,
    });

    expect(entries).toEqual([
      {
        kind: 'toolIntent',
        atMs: NOW_MS,
        path: toolCandidate.path,
        allocatedBytes: toolCandidate.allocatedBytes,
        unit: expect.objectContaining({ kind: 'miseVersion', installPath: toolCandidate.path }),
        args: ['uninstall', 'node@20.1.0'],
      },
    ]);
    expect(run.outcomes).toEqual([
      {
        path: toolCandidate.path,
        allocatedBytes: toolCandidate.allocatedBytes,
        freedBytes: 0,
        outcome: 'notAttempted',
        code: null,
      },
      { path: pathItem, allocatedBytes: 4096, freedBytes: 0, outcome: 'notAttempted', code: null },
    ]);
    expect(await isPresent(pathItem)).toBe(true);
  });

  test('does nothing for an empty list', async () => {
    const run = await deleteCandidates({
      candidates: [],
      journal: await createTestJournal(),
      processCommands: [],
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run).toEqual({ outcomes: [], journalFailure: null });
  });
});

describe('toolCandidateRunToRemoval', () => {
  const TOOL_PATH = '/Users/tester/.local/share/mise/installs/node/20.1.0';

  test('a completed run is removed with its measured drop and the stderr tail', () => {
    expect(
      toolCandidateRunToRemoval({
        path: TOOL_PATH,
        allocatedBytes: 8192,
        run: { kind: 'completed', freedBytes: 6144, stderrTail: 'removed node@20.1.0' },
        atMs: NOW_MS,
      }),
    ).toEqual({
      outcome: {
        path: TOOL_PATH,
        allocatedBytes: 8192,
        freedBytes: 6144,
        outcome: 'removed',
        code: null,
      },
      outcomeEntry: {
        kind: 'toolOutcome',
        atMs: NOW_MS,
        path: TOOL_PATH,
        outcome: 'removed',
        exitCode: 0,
        stderrTail: 'removed node@20.1.0',
        freedBytes: 6144,
      },
    });
  });

  test('a skipped run frees nothing and records its reason', () => {
    expect(
      toolCandidateRunToRemoval({
        path: TOOL_PATH,
        allocatedBytes: 8192,
        run: { kind: 'skipped', reason: 'ownerRunning' },
        atMs: NOW_MS,
      }),
    ).toEqual({
      outcome: {
        path: TOOL_PATH,
        allocatedBytes: 8192,
        freedBytes: 0,
        outcome: 'ownerRunning',
        code: null,
      },
      outcomeEntry: { kind: 'toolOutcome', atMs: NOW_MS, path: TOOL_PATH, outcome: 'ownerRunning' },
    });
  });

  test('a failed run keeps what it freed and its failure', () => {
    const failure = {
      reason: 'commandFailed',
      failure: { reason: 'exitedWithError', exitCode: 1, stderrTail: 'locked' },
    } as const;

    expect(
      toolCandidateRunToRemoval({
        path: TOOL_PATH,
        allocatedBytes: 8192,
        run: { kind: 'failed', freedBytes: 1024, failure: failure },
        atMs: NOW_MS,
      }),
    ).toEqual({
      outcome: {
        path: TOOL_PATH,
        allocatedBytes: 8192,
        freedBytes: 1024,
        outcome: 'toolFailed',
        failure: failure,
      },
      outcomeEntry: {
        kind: 'toolOutcome',
        atMs: NOW_MS,
        path: TOOL_PATH,
        outcome: 'toolFailed',
        freedBytes: 1024,
        failure: failure,
      },
    });
  });
});
