import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RemovalOutcomeKind } from '../../src/delete/deleteCandidates.js';
import {
  deleteCandidates,
  isUnremovedOutcome,
  toolCandidateRunToRemoval,
} from '../../src/delete/deleteCandidates.js';
import type { DeletionJournal, JournalEntry } from '../../src/delete/deletionJournal.js';
import { createDeletionJournal } from '../../src/delete/deletionJournal.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type {
  ExploreToolUnit,
  ExploreToolUnitSimulatorDevice,
} from '../../src/explore/exploreUnit.js';
import type { Candidate } from '../../src/scan/candidate.js';
import { loadUnitMeasurement } from '../../src/scan/loadUnitMeasurement.js';
import { loadFileIdentity } from '../../src/system/loadFileIdentity.js';
import { createUnitRunFakeTool } from '../explore/probeFakeTools.js';
import {
  buildDeviceDataPath,
  buildMisePrunableJson,
  buildSimulatorDeviceListJson,
  UNAVAILABLE_DEVICE_UDID,
} from '../explore/probeOutputFixtures.js';
import {
  buildTestDartToolCandidate,
  buildTestToolCandidate,
} from '../support/candidateFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  isPresent,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';

const NOW_MS = Date.UTC(2026, 9, 1);

const SIMULATOR_APP_COMMAND =
  '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator';

let fixtureRoot: FixtureRoot;
let environment: Environment;
let markerPath: string;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });
  markerPath = join(fixtureRoot.rootDir, 'command-ran');
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

/** A loader that answers `processCommands` on every read. */
function buildProcessCommandsLoader(
  processCommands: string[] | null,
): () => Promise<string[] | null> {
  return async () => processCommands;
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

async function loadJournalLines(journal: DeletionJournal): Promise<unknown[]> {
  return (await readFile(journal.logPath, 'utf8'))
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
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

/** A journal that keeps each entry in `entries` and fails every append. */
function buildRefusingJournal(params: { entries: JournalEntry[] }): DeletionJournal {
  return {
    logPath: join(fixtureRoot.rootDir, 'deletions.jsonl'),
    append: async (appendParams) => {
      params.entries.push(appendParams.entry);

      return {
        kind: 'failed',
        failure: { reason: 'writeFailed', path: 'deletions.jsonl', code: 'ENOSPC' },
      };
    },
  };
}

async function createFolderWithFile(path: string): Promise<void> {
  await mkdir(join(path, 'nested'), { recursive: true });
  await createFixtureFile({
    path: join(path, 'nested/blob.bin'),
    sizeBytes: 8192,
    modifiedMs: NOW_MS,
  });
}

async function createCacheFolder(name: string): Promise<string> {
  const path = join(fixtureRoot.homeDir, 'Library/Caches', name);

  await createFolderWithFile(path);

  return path;
}

function readToolUnit(candidate: Candidate): ExploreToolUnit {
  if (candidate.removal.kind !== 'runTool') {
    throw new Error('Not a tool candidate.');
  }

  return candidate.removal.unit;
}

/**
 * A tool item of a mise version whose install folder exists, with a fake mise at the item's tool
 * path that answers the probe and runs the body `buildCommandBody` returns on uninstall.
 */
async function createToolCandidate(params: {
  version: string;
  buildCommandBody: (installPath: string) => string;
}): Promise<Candidate> {
  const candidate = buildTestToolCandidate({
    homeDir: fixtureRoot.homeDir,
    version: params.version,
  });
  const unit = readToolUnit(candidate);

  await createFolderWithFile(candidate.path);
  await createUnitRunFakeTool({
    folder: dirname(unit.tool.path),
    unit: unit,
    probeStdoutText: buildMisePrunableJson({ homeDir: fixtureRoot.homeDir }),
    probeExitCode: 0,
    commandBody: params.buildCommandBody(candidate.path),
  });

  return candidate;
}

/**
 * A tool item of the fixture device whose runtime is gone, with its data folder and a fake xcrun
 * that lists it and, on delete, leaves the marker file and removes the folder.
 */
async function createSimulatorCandidate(): Promise<Candidate> {
  const dataPath = buildDeviceDataPath({
    homeDir: fixtureRoot.homeDir,
    udid: UNAVAILABLE_DEVICE_UDID,
  });
  const unit: ExploreToolUnitSimulatorDevice = {
    kind: 'simulatorDevice',
    tool: { name: 'xcrun', path: join(fixtureRoot.rootDir, 'tools', 'xcrun') },
    udid: UNAVAILABLE_DEVICE_UDID,
    dataPath: dataPath,
  };

  await createFolderWithFile(dataPath);
  await createUnitRunFakeTool({
    folder: dirname(unit.tool.path),
    unit: unit,
    probeStdoutText: buildSimulatorDeviceListJson({ homeDir: fixtureRoot.homeDir }),
    probeExitCode: 0,
    commandBody: `touch '${markerPath}'
rm -r '${dataPath}'
exit 0`,
  });

  return {
    path: dirname(dataPath),
    title: 'Simulator iPhone 15',
    category: 'developer',
    risk: 'review',
    origin: 'explore',
    explanation: 'A simulator device.',
    regeneration: 'It does not come back.',
    allocatedBytes: 8192,
    entryCount: 1,
    isComplete: true,
    removal: { kind: 'runTool', unit: unit },
    evidenceLines: [],
  };
}

async function measureAllocatedBytes(candidate: Candidate): Promise<number> {
  const measurement = await loadUnitMeasurement({
    unit: readToolUnit(candidate),
    deadlineMs: Date.now() + 60_000,
  });

  return measurement.allocatedBytes;
}

function buildExpectedToolIntent(params: { candidate: Candidate; version: string }): unknown {
  return {
    kind: 'toolIntent',
    atMs: NOW_MS,
    path: params.candidate.path,
    allocatedBytes: params.candidate.allocatedBytes,
    unit: readToolUnit(params.candidate),
    args: ['uninstall', `node@${params.version}`],
  };
}

describe('deleteCandidates', () => {
  test('deletes exactly the given items and records intent before outcome', async () => {
    const selected = await createCacheFolder('selected');
    const sibling = await createCacheFolder('sibling');
    const journal = await createTestJournal();

    const run = await deleteCandidates({
      candidates: [await scanCandidate(selected)],
      journal: journal,
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      clock: () => NOW_MS,
    });
    const journalLines = await loadJournalLines(journal);

    expect(run).toEqual({
      outcomes: [
        { path: selected, allocatedBytes: 4096, freedBytes: 4096, outcome: 'removed', code: null },
      ],
      journalFailure: null,
    });
    expect(await isPresent(selected)).toBe(false);
    expect(await isPresent(join(sibling, 'nested/blob.bin'))).toBe(true);
    expect(journalLines).toMatchObject([
      { kind: 'sessionStart' },
      { kind: 'intent' },
      { kind: 'outcome', path: selected, outcome: 'removed' },
    ]);
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
      loadProcessCommands: buildProcessCommandsLoader([]),
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
      loadProcessCommands: buildProcessCommandsLoader([]),
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
      loadProcessCommands: buildProcessCommandsLoader([]),
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
      loadProcessCommands: buildProcessCommandsLoader([]),
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
      loadProcessCommands: buildProcessCommandsLoader([]),
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
      loadProcessCommands: buildProcessCommandsLoader([]),
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
      loadProcessCommands: buildProcessCommandsLoader([]),
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
      loadProcessCommands: buildProcessCommandsLoader([
        '/Applications/Example.app/Contents/MacOS/Example',
      ]),
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
      loadProcessCommands: buildProcessCommandsLoader(null),
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

    const run = await deleteCandidates({
      candidates: [toolCandidate, await scanCandidate(pathItem)],
      journal: buildRefusingJournal({ entries: entries }),
      environment: environment,
      loadProcessCommands: buildProcessCommandsLoader([]),
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

  test('records every argument of a tool item, the leading ones of its tool first', async () => {
    const entries: JournalEntry[] = [];

    await deleteCandidates({
      candidates: [buildTestDartToolCandidate({ homeDir: fixtureRoot.homeDir })],
      journal: buildRefusingJournal({ entries: entries }),
      environment: environment,
      loadProcessCommands: buildProcessCommandsLoader([]),
      clock: () => NOW_MS,
    });

    expect(entries).toMatchObject([
      { kind: 'toolIntent', args: ['--suppress-analytics', 'pub', 'cache', 'gc', '--force'] },
    ]);
  });

  test('does nothing for an empty list', async () => {
    const run = await deleteCandidates({
      candidates: [],
      journal: await createTestJournal(),
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      clock: () => NOW_MS,
    });

    expect(run).toEqual({ outcomes: [], journalFailure: null });
  });
});

describe('deleteCandidates with a tool item', () => {
  test('records the intent and then the outcome of a completed run', async () => {
    const candidate = await createToolCandidate({
      version: '20.1.0',
      buildCommandBody: (installPath) => `rm -r '${installPath}'
echo 'uninstalled node@20.1.0' >&2
exit 0`,
    });
    const allocatedBytes = await measureAllocatedBytes(candidate);
    const journal = await createTestJournal();

    const run = await deleteCandidates({
      candidates: [candidate],
      journal: journal,
      environment: environment,
      loadProcessCommands: buildProcessCommandsLoader([]),
      clock: () => NOW_MS,
    });

    expect(allocatedBytes).toBeGreaterThan(0);
    expect(run).toEqual({
      outcomes: [
        {
          path: candidate.path,
          allocatedBytes: candidate.allocatedBytes,
          freedBytes: allocatedBytes,
          outcome: 'removed',
          code: null,
        },
      ],
      journalFailure: null,
    });
    expect((await loadJournalLines(journal)).slice(1)).toEqual([
      buildExpectedToolIntent({ candidate: candidate, version: '20.1.0' }),
      {
        kind: 'toolOutcome',
        atMs: NOW_MS,
        path: candidate.path,
        outcome: 'removed',
        exitCode: 0,
        stderrTail: 'uninstalled node@20.1.0\n',
        freedBytes: allocatedBytes,
      },
    ]);
    expect(await isPresent(candidate.path)).toBe(false);
  });

  test('records the intent and then the skip of a unit that changed since the scan', async () => {
    const candidate = await createToolCandidate({
      version: '18.0.0',
      buildCommandBody: (installPath) => `rm -r '${installPath}'
exit 0`,
    });
    const journal = await createTestJournal();

    const run = await deleteCandidates({
      candidates: [candidate],
      journal: journal,
      environment: environment,
      loadProcessCommands: buildProcessCommandsLoader([]),
      clock: () => NOW_MS,
    });

    expect(run).toEqual({
      outcomes: [
        {
          path: candidate.path,
          allocatedBytes: candidate.allocatedBytes,
          freedBytes: 0,
          outcome: 'changedSinceScan',
          code: null,
        },
      ],
      journalFailure: null,
    });
    expect((await loadJournalLines(journal)).slice(1)).toEqual([
      buildExpectedToolIntent({ candidate: candidate, version: '18.0.0' }),
      { kind: 'toolOutcome', atMs: NOW_MS, path: candidate.path, outcome: 'changedSinceScan' },
    ]);
    expect(await isPresent(candidate.path)).toBe(true);
  });

  test('records the intent and then the failure of a command that exited non-zero', async () => {
    const candidate = await createToolCandidate({
      version: '20.1.0',
      buildCommandBody: () => `echo 'node@20.1.0 is in use' >&2
exit 1`,
    });
    const journal = await createTestJournal();
    const failure = {
      reason: 'commandFailed',
      failure: { reason: 'exitedWithError', exitCode: 1, stderrTail: 'node@20.1.0 is in use\n' },
    } as const;

    const run = await deleteCandidates({
      candidates: [candidate],
      journal: journal,
      environment: environment,
      loadProcessCommands: buildProcessCommandsLoader([]),
      clock: () => NOW_MS,
    });

    expect(run).toEqual({
      outcomes: [
        {
          path: candidate.path,
          allocatedBytes: candidate.allocatedBytes,
          freedBytes: 0,
          outcome: 'toolFailed',
          failure: failure,
        },
      ],
      journalFailure: null,
    });
    expect((await loadJournalLines(journal)).slice(1)).toEqual([
      buildExpectedToolIntent({ candidate: candidate, version: '20.1.0' }),
      {
        kind: 'toolOutcome',
        atMs: NOW_MS,
        path: candidate.path,
        outcome: 'toolFailed',
        freedBytes: 0,
        failure: failure,
      },
    ]);
    expect(await isPresent(candidate.path)).toBe(true);
  });

  test('removes a path item and a tool item in one run', async () => {
    const pathItem = join(fixtureRoot.homeDir, 'Library/Caches/beside-tool');

    await createFolderWithFile(pathItem);

    const toolCandidate = await createToolCandidate({
      version: '20.1.0',
      buildCommandBody: (installPath) => `rm -r '${installPath}'
exit 0`,
    });
    const toolAllocatedBytes = await measureAllocatedBytes(toolCandidate);
    const journal = await createTestJournal();

    const run = await deleteCandidates({
      candidates: [await scanCandidate(pathItem), toolCandidate],
      journal: journal,
      environment: environment,
      loadProcessCommands: buildProcessCommandsLoader([]),
      clock: () => NOW_MS,
    });
    const journalLines = await loadJournalLines(journal);

    expect(run).toEqual({
      outcomes: [
        { path: pathItem, allocatedBytes: 4096, freedBytes: 4096, outcome: 'removed', code: null },
        {
          path: toolCandidate.path,
          allocatedBytes: toolCandidate.allocatedBytes,
          freedBytes: toolAllocatedBytes,
          outcome: 'removed',
          code: null,
        },
      ],
      journalFailure: null,
    });
    expect(journalLines).toMatchObject([
      { kind: 'sessionStart' },
      { kind: 'intent', path: pathItem },
      { kind: 'outcome', path: pathItem, outcome: 'removed' },
      { kind: 'toolIntent', path: toolCandidate.path, args: ['uninstall', 'node@20.1.0'] },
      { kind: 'toolOutcome', path: toolCandidate.path, outcome: 'removed', exitCode: 0 },
    ]);
    expect(await isPresent(pathItem)).toBe(false);
    expect(await isPresent(toolCandidate.path)).toBe(false);
  });

  test('reads the processes afresh for a tool item, so a simulator started meanwhile stays', async () => {
    const pathItem = await createCacheFolder('before-simulator');
    const simulatorCandidate = await createSimulatorCandidate();
    const processReads: (string[] | null)[] = [[], [SIMULATOR_APP_COMMAND]];
    let readCount = 0;

    const run = await deleteCandidates({
      candidates: [await scanCandidate(pathItem), simulatorCandidate],
      journal: await createTestJournal(),
      environment: environment,
      loadProcessCommands: async () => {
        readCount += 1;

        return processReads[readCount - 1] ?? [];
      },
      clock: () => NOW_MS,
    });

    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual(['removed', 'ownerRunning']);
    expect(readCount).toBe(2);
    expect(await isPresent(markerPath)).toBe(false);
    expect(await isPresent(readToolUnit(simulatorCandidate).tool.path)).toBe(true);
    expect(await isPresent(simulatorCandidate.path)).toBe(true);
  });
});

describe('isUnremovedOutcome', () => {
  test('is true only for the outcomes that left their item through a failure', () => {
    const kinds: RemovalOutcomeKind[] = [
      'removed',
      'alreadyGone',
      'changedSinceScan',
      'ownerRunning',
      'permissionDenied',
      'failed',
      'notAttempted',
      'toolFailed',
    ];

    expect(kinds.filter(isUnremovedOutcome)).toEqual(['permissionDenied', 'failed', 'toolFailed']);
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
