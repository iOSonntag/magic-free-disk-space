import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RemovalOutcomeKind, RemovalRun } from '../../src/delete/deleteCandidates.js';
import {
  deleteCandidates,
  isUnremovedOutcome,
  toolCandidateRunToRemoval,
} from '../../src/delete/deleteCandidates.js';
import type { DeletePlatform } from '../../src/delete/deletePlatform.js';
import type { DeletionJournal, JournalEntry } from '../../src/delete/deletionJournal.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type {
  ExploreToolUnit,
  ExploreToolUnitSimulatorDevice,
} from '../../src/explore/exploreUnit.js';
import { listUnitPaths } from '../../src/explore/exploreUnit.js';
import type { Result } from '../../src/result.js';
import type {
  Candidate,
  CandidateRecycleBin,
  RecycleBinContent,
  RemovalOwner,
  RemovalTarget,
} from '../../src/scan/candidate.js';
import { loadFileIdentity } from '../../src/system/loadFileIdentity.js';
import { buildRemoveFolderBody, createUnitRunFakeTool } from '../explore/probeFakeTools.js';
import {
  buildDeviceDataPath,
  buildMisePrunableJson,
  buildSimulatorDeviceListJson,
  UNAVAILABLE_DEVICE_UDID,
} from '../explore/probeOutputFixtures.js';
import {
  buildTestVscodeExtensionCandidate,
  buildVscodeExtensionsPath,
  buildVscodeProfilesPath,
  buildVscodeRegistryText,
  createVscodeExtensionFolders,
  createVscodeInstallation,
  FIXTURE_PROFILE_ID,
  OBSOLETE_FOLDER_NAME,
  OLDER_FOLDER_NAME,
  VSCODE_FOLDER_SIZE_BYTES,
  VSCODE_HOST_PROCESS,
} from '../explore/vscodeExtensionFixtures.js';
import {
  buildTestCandidate,
  buildTestDartToolCandidate,
  buildTestProbedCandidate,
  buildTestToolCandidate,
} from '../support/candidateFixtures.js';
import { createTestJournal } from '../support/deletionJournalFixtures.js';
import { loadMeasuredAllocatedBytes } from '../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  isPresent,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import {
  buildExampleHome,
  buildTestHostPath,
  buildTestWindowsImageName,
  buildTestWindowsPath,
} from '../support/parsedValueFixtures.js';
import { HOST_PLATFORM } from '../support/platformFixtures.js';
import { describeOnPosix, testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

const NOW_MS = Date.UTC(2026, 9, 1);

const SIMULATOR_APP_COMMAND =
  '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator';

/** The host's slices a deletion reads, with the probe facts of the tests. */
const DELETION_PLATFORM = {
  delete: HOST_PLATFORM.delete,
  probePlatform: buildTestProbePlatform(),
  entryReads: HOST_PLATFORM.system.entryReads,
};

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

/** The target at `path` with the identity it has now, as the scanner reads it. */
async function scanTarget(path: string): Promise<RemovalTarget> {
  const identity = await loadFileIdentity({ path: path });

  if (identity.kind === 'failed') {
    throw new Error(`Cannot scan ${path}: ${identity.failure.reason}`);
  }

  return { path: path, identity: identity.value };
}

/** Scans a fixture path the way the scanner does, so the candidate carries its real identity. */
async function scanCandidate(
  path: string,
  owner: RemovalOwner = { kind: 'none' },
): Promise<Candidate> {
  return buildTestCandidate({
    path: path,
    title: 'Fixture item',
    removal: {
      kind: 'deletePaths',
      targets: [await scanTarget(path)],
      owner: owner,
    },
  });
}

/** Scans a fixture path with its identity and its size as the scanner measures it. */
async function scanMeasuredCandidate(path: string): Promise<Candidate> {
  return {
    ...(await scanCandidate(path)),
    allocatedBytes: await loadMeasuredAllocatedBytes({ paths: [path] }),
  };
}

/**
 * A removal that takes `removedPath` with everything below it, or nothing for `null`, and then
 * fails with `failure`, as a removal stopped partway by a locked entry does.
 */
function buildFailingRemoval(params: {
  removedPath: string | null;
  failure: string;
}): DeletePlatform {
  return {
    ...HOST_PLATFORM.delete,
    removeTree: async () => {
      if (params.removedPath !== null) {
        await rm(params.removedPath, { recursive: true });
      }

      return { kind: 'failed', failure: params.failure };
    },
  };
}

/** A journal of the deletions in the fixture root's own log. */
function createFixtureRootJournal(): Promise<DeletionJournal> {
  return createTestJournal({
    logPath: join(fixtureRoot.rootDir, 'deletions.jsonl'),
    nowMs: NOW_MS,
  });
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
  const candidate = buildTestToolCandidate({ home: environment, version: params.version });
  const unit = readToolUnit(candidate);

  await createFolderWithFile(candidate.path);
  await createUnitRunFakeTool({
    folder: dirname(unit.tool.path),
    unit: unit,
    answers: [
      {
        command: 'miseVersions',
        stdoutText: buildMisePrunableJson({ homeDir: fixtureRoot.homeDir }),
        exitCode: 0,
      },
    ],
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
    answers: [
      {
        command: 'simulatorDevices',
        stdoutText: buildSimulatorDeviceListJson({ homeDir: fixtureRoot.homeDir }),
        exitCode: 0,
      },
    ],
    commandBody: `fs.writeFileSync(${JSON.stringify(markerPath)}, '');
${buildRemoveFolderBody(dataPath)}
process.exit(0);`,
  });

  return buildTestProbedCandidate({
    path: dirname(dataPath),
    title: 'Simulator iPhone 15',
    category: 'developer',
    risk: 'review',
    allocatedBytes: 8192,
    probe: 'simulatorDevices',
    removal: { kind: 'runTool', unit: unit },
  });
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
    const journal = await createFixtureRootJournal();

    const selectedCandidate = await scanCandidate(selected);

    const run = await deleteCandidates({
      candidates: [selectedCandidate],
      journal: journal,
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });
    const journalLines = await loadJournalLines(journal);

    expect(run).toEqual({
      outcomes: [
        {
          candidate: selectedCandidate,
          freedBytes: 4096,
          outcome: 'removed',
          code: null,
        },
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

  testOnPosix(
    'removes a symbolic link inside a deleted folder without touching its target',
    async () => {
      const selected = await createCacheFolder('with-link');
      const keptFolder = join(fixtureRoot.homeDir, 'Documents/important');
      const keptFile = join(keptFolder, 'thesis.txt');

      await mkdir(keptFolder, { recursive: true });
      await createFixtureFile({ path: keptFile, sizeBytes: 100, modifiedMs: NOW_MS });
      await symlink(keptFolder, join(selected, 'link-to-folder'));
      await symlink(keptFile, join(selected, 'link-to-file'));

      const run = await deleteCandidates({
        candidates: [await scanCandidate(selected)],
        journal: await createFixtureRootJournal(),
        loadProcessCommands: buildProcessCommandsLoader([]),
        environment: environment,
        ...DELETION_PLATFORM,
        clock: () => NOW_MS,
      });

      expect(run.outcomes[0]?.outcome).toBe('removed');
      expect(await isPresent(selected)).toBe(false);
      expect(await readFile(keptFile, 'utf8')).toHaveLength(100);
    },
  );

  test('leaves a folder alone that was replaced after the scan', async () => {
    const selected = await createCacheFolder('replaced');
    const scanned = await scanCandidate(selected);

    await rm(selected, { recursive: true });
    await createCacheFolder('replaced');

    const run = await deleteCandidates({
      candidates: [scanned],
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'changedSinceScan', freedBytes: 0 });
    expect(await isPresent(join(selected, 'nested/blob.bin'))).toBe(true);
  });

  testOnPosix(
    'leaves a symbolic link alone that took the place of the scanned folder',
    async () => {
      const selected = await createCacheFolder('swapped');
      const target = await createCacheFolder('target');
      const scanned = await scanCandidate(selected);

      await rm(selected, { recursive: true });
      await symlink(target, selected);

      const run = await deleteCandidates({
        candidates: [scanned],
        journal: await createFixtureRootJournal(),
        loadProcessCommands: buildProcessCommandsLoader([]),
        environment: environment,
        ...DELETION_PLATFORM,
        clock: () => NOW_MS,
      });

      expect(run.outcomes[0]?.outcome).toBe('changedSinceScan');
      expect(await isPresent(selected)).toBe(true);
      expect(await isPresent(join(target, 'nested/blob.bin'))).toBe(true);
    },
  );

  test('reports an item that vanished as already gone and goes on', async () => {
    const vanished = await createCacheFolder('vanished');
    const next = await createCacheFolder('next');
    const candidates = [await scanCandidate(vanished), await scanCandidate(next)];

    await rm(vanished, { recursive: true });

    const run = await deleteCandidates({
      candidates: candidates,
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });

    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual(['alreadyGone', 'removed']);
  });

  testOnPosix('reports a permission denial, keeps the file, and goes on', async () => {
    const lockedFolder = join(fixtureRoot.homeDir, 'Downloads');
    const lockedFile = join(lockedFolder, 'locked.bin');
    const next = await createCacheFolder('after-locked');

    await mkdir(lockedFolder, { recursive: true });
    await createFixtureFile({ path: lockedFile, sizeBytes: 4096, modifiedMs: NOW_MS });

    const candidates = [await scanCandidate(lockedFile), await scanCandidate(next)];

    await chmod(lockedFolder, 0o500);

    const run = await deleteCandidates({
      candidates: candidates,
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'permissionDenied', code: 'EACCES' });
    expect(run.outcomes[1]?.outcome).toBe('removed');
    expect(await isPresent(lockedFile)).toBe(true);
  });

  test('a removal that fails partway frees the scanned size less what is left', async () => {
    const selected = await createCacheFolder('partly');
    const keptFile = join(selected, 'kept.bin');

    await createFixtureFile({ path: keptFile, sizeBytes: 4096, modifiedMs: NOW_MS });

    const candidate = await scanMeasuredCandidate(selected);
    const run = await deleteCandidates({
      candidates: [candidate],
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      delete: buildFailingRemoval({
        removedPath: join(selected, 'nested/blob.bin'),
        failure: 'EACCES',
      }),
      clock: () => NOW_MS,
    });
    const leftBytes = await loadMeasuredAllocatedBytes({ paths: [selected] });

    expect(leftBytes).toBeGreaterThan(0);
    expect(candidate.allocatedBytes - leftBytes).toBeGreaterThanOrEqual(8192);
    expect(run.outcomes).toEqual([
      {
        candidate: candidate,
        freedBytes: candidate.allocatedBytes - leftBytes,
        outcome: 'permissionDenied',
        code: 'EACCES',
      },
    ]);
    expect(await isPresent(keptFile)).toBe(true);
  });

  test('a removal that fails before removing anything frees nothing', async () => {
    const selected = await createCacheFolder('untouched');
    const candidate = await scanMeasuredCandidate(selected);

    const run = await deleteCandidates({
      candidates: [candidate],
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      delete: buildFailingRemoval({ removedPath: null, failure: 'EBUSY' }),
      clock: () => NOW_MS,
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'failed', code: 'EBUSY', freedBytes: 0 });
  });

  test('a removal that fails once the path is gone frees the whole scanned size', async () => {
    const selected = await createCacheFolder('gone-at-failure');
    const candidate = await scanMeasuredCandidate(selected);

    const run = await deleteCandidates({
      candidates: [candidate],
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      delete: buildFailingRemoval({ removedPath: selected, failure: 'EIO' }),
      clock: () => NOW_MS,
    });

    expect(run.outcomes[0]).toMatchObject({
      outcome: 'failed',
      code: 'EIO',
      freedBytes: candidate.allocatedBytes,
    });
    expect(candidate.allocatedBytes).toBeGreaterThanOrEqual(8192);
  });

  testOnPosix('deletes nothing when the intent cannot be recorded', async () => {
    const first = await createCacheFolder('first');
    const second = await createCacheFolder('second');
    const journal = await createFixtureRootJournal();
    const candidates = [await scanCandidate(first), await scanCandidate(second)];

    await chmod(journal.logPath, 0o400);

    const run = await deleteCandidates({
      candidates: candidates,
      journal: journal,
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
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
    const journal = buildFailingJournal({
      inner: await createFixtureRootJournal(),
      successCount: 1,
    });

    const run = await deleteCandidates({
      candidates: candidates,
      journal: journal,
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
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
      await scanCandidate(appCache, {
        kind: 'bundles',
        bundlePaths: ['/Applications/Example.app'],
      }),
      await scanCandidate(ownerless),
    ];

    const run = await deleteCandidates({
      candidates: candidates,
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([
        '/Applications/Example.app/Contents/MacOS/Example',
      ]),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });

    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual(['ownerRunning', 'removed']);
    expect(await isPresent(join(appCache, 'nested/blob.bin'))).toBe(true);
  });

  test('leaves an item alone whose Windows program started after the scan, by folder or name', async () => {
    const editorCache = await createCacheFolder('editor-cache');
    const toolCache = await createCacheFolder('tool-cache');
    const idleCache = await createCacheFolder('idle-cache');
    const candidates = [
      await scanCandidate(editorCache, {
        kind: 'executable',
        imageNames: [],
        installFolderPath: buildTestHostPath({ text: join(fixtureRoot.rootDir, 'Example Editor') }),
      }),
      await scanCandidate(toolCache, {
        kind: 'executable',
        imageNames: [buildTestWindowsImageName({ text: 'tool.exe' })],
        installFolderPath: null,
      }),
      await scanCandidate(idleCache, {
        kind: 'executable',
        imageNames: [buildTestWindowsImageName({ text: 'idle.exe' })],
        installFolderPath: null,
      }),
    ];

    const run = await deleteCandidates({
      candidates: candidates,
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([
        join(fixtureRoot.rootDir, 'Example Editor', 'bin', 'editor.exe'),
        'C:\\Tools\\TOOL.EXE',
      ]),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });

    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual([
      'ownerRunning',
      'ownerRunning',
      'removed',
    ]);
    expect(await isPresent(join(editorCache, 'nested/blob.bin'))).toBe(true);
    expect(await isPresent(join(toolCache, 'nested/blob.bin'))).toBe(true);
  });

  test('withholds every owned item when the process list cannot be read', async () => {
    const appCache = await createCacheFolder('app-cache');
    const programCache = await createCacheFolder('program-cache');
    const ownerless = await createCacheFolder('ownerless');
    const candidates = [
      await scanCandidate(appCache, {
        kind: 'bundles',
        bundlePaths: ['/Applications/Example.app'],
      }),
      await scanCandidate(programCache, {
        kind: 'executable',
        imageNames: [buildTestWindowsImageName({ text: 'tool.exe' })],
        installFolderPath: null,
      }),
      await scanCandidate(ownerless),
    ];

    const run = await deleteCandidates({
      candidates: candidates,
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader(null),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });

    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual([
      'ownerRunning',
      'ownerRunning',
      'removed',
    ]);
    expect(await isPresent(appCache)).toBe(true);
    expect(await isPresent(programCache)).toBe(true);
  });

  test('records the tool intent first and runs no tool when it cannot be recorded', async () => {
    const pathItem = await createCacheFolder('after-tool');
    const toolCandidate = buildTestToolCandidate({ home: environment, version: '20.1.0' });
    const pathCandidate = await scanCandidate(pathItem);
    const entries: JournalEntry[] = [];

    const run = await deleteCandidates({
      candidates: [toolCandidate, pathCandidate],
      journal: buildRefusingJournal({ entries: entries }),
      environment: environment,
      ...DELETION_PLATFORM,
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
        candidate: toolCandidate,
        freedBytes: 0,
        outcome: 'notAttempted',
        code: null,
      },
      {
        candidate: pathCandidate,
        freedBytes: 0,
        outcome: 'notAttempted',
        code: null,
      },
    ]);
    expect(await isPresent(pathItem)).toBe(true);
  });

  test('records every argument of a tool item, the leading ones of its tool first', async () => {
    const entries: JournalEntry[] = [];

    await deleteCandidates({
      candidates: [buildTestDartToolCandidate({ home: environment })],
      journal: buildRefusingJournal({ entries: entries }),
      environment: environment,
      ...DELETION_PLATFORM,
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
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });

    expect(run).toEqual({ outcomes: [], journalFailure: null });
  });
});

// A fake tool runs only once it is trusted, which POSIX owners and modes decide.
describeOnPosix('deleteCandidates with a tool item', () => {
  test('records the intent and then the outcome of a completed run', async () => {
    const candidate = await createToolCandidate({
      version: '20.1.0',
      buildCommandBody: (installPath) => `${buildRemoveFolderBody(installPath)}
fs.writeSync(2, 'uninstalled node@20.1.0\\n');
process.exit(0);`,
    });
    const allocatedBytes = await loadMeasuredAllocatedBytes({
      paths: listUnitPaths(readToolUnit(candidate)),
    });
    const journal = await createFixtureRootJournal();

    const run = await deleteCandidates({
      candidates: [candidate],
      journal: journal,
      environment: environment,
      ...DELETION_PLATFORM,
      loadProcessCommands: buildProcessCommandsLoader([]),
      clock: () => NOW_MS,
    });

    expect(allocatedBytes).toBeGreaterThan(0);
    expect(run).toEqual({
      outcomes: [
        {
          candidate: candidate,
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
      buildCommandBody: (installPath) => `${buildRemoveFolderBody(installPath)}
process.exit(0);`,
    });
    const journal = await createFixtureRootJournal();

    const run = await deleteCandidates({
      candidates: [candidate],
      journal: journal,
      environment: environment,
      ...DELETION_PLATFORM,
      loadProcessCommands: buildProcessCommandsLoader([]),
      clock: () => NOW_MS,
    });

    expect(run).toEqual({
      outcomes: [
        {
          candidate: candidate,
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
      buildCommandBody: () => `fs.writeSync(2, 'node@20.1.0 is in use\\n');
process.exit(1);`,
    });
    const journal = await createFixtureRootJournal();
    const failure = {
      reason: 'commandFailed',
      failure: { reason: 'exitedWithError', exitCode: 1, stderrTail: 'node@20.1.0 is in use\n' },
    } as const;

    const run = await deleteCandidates({
      candidates: [candidate],
      journal: journal,
      environment: environment,
      ...DELETION_PLATFORM,
      loadProcessCommands: buildProcessCommandsLoader([]),
      clock: () => NOW_MS,
    });

    expect(run).toEqual({
      outcomes: [
        {
          candidate: candidate,
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
      buildCommandBody: (installPath) => `${buildRemoveFolderBody(installPath)}
process.exit(0);`,
    });
    const toolAllocatedBytes = await loadMeasuredAllocatedBytes({
      paths: listUnitPaths(readToolUnit(toolCandidate)),
    });
    const pathCandidate = await scanCandidate(pathItem);
    const journal = await createFixtureRootJournal();

    const run = await deleteCandidates({
      candidates: [pathCandidate, toolCandidate],
      journal: journal,
      environment: environment,
      ...DELETION_PLATFORM,
      loadProcessCommands: buildProcessCommandsLoader([]),
      clock: () => NOW_MS,
    });
    const journalLines = await loadJournalLines(journal);

    expect(run).toEqual({
      outcomes: [
        {
          candidate: pathCandidate,
          freedBytes: 4096,
          outcome: 'removed',
          code: null,
        },
        {
          candidate: toolCandidate,
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
      journal: await createFixtureRootJournal(),
      environment: environment,
      ...DELETION_PLATFORM,
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

describe('deleteCandidates with a VS Code extension folder', () => {
  /** The obsolete folder of the fixture installation, scanned with the identity it has. */
  async function scanVscodeCandidate(): Promise<Candidate> {
    await createVscodeInstallation({ environment: environment });

    const candidate = buildTestVscodeExtensionCandidate({ home: environment });

    if (candidate.removal.kind !== 'deleteUnitPaths') {
      throw new Error('The obsolete folder should be scanned as the paths of a unit.');
    }

    return {
      ...candidate,
      removal: { ...candidate.removal, targets: [await scanTarget(candidate.path)] },
    };
  }

  async function deleteVscodeCandidate(params: {
    candidate: Candidate;
    loadProcessCommands: () => Promise<string[] | null>;
  }): Promise<RemovalRun> {
    return deleteCandidates({
      candidates: [params.candidate],
      journal: await createFixtureRootJournal(),
      loadProcessCommands: params.loadProcessCommands,
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });
  }

  test('deletes the folder as a path and records a path intent and outcome', async () => {
    const candidate = await scanVscodeCandidate();
    const journal = await createFixtureRootJournal();
    const run = await deleteCandidates({
      candidates: [candidate],
      journal: journal,
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });

    expect(run).toEqual({
      outcomes: [
        {
          candidate: candidate,
          freedBytes: VSCODE_FOLDER_SIZE_BYTES,
          outcome: 'removed',
          code: null,
        },
      ],
      journalFailure: null,
    });
    expect(await loadJournalLines(journal)).toEqual([
      expect.objectContaining({ kind: 'sessionStart' }),
      {
        kind: 'intent',
        atMs: NOW_MS,
        path: candidate.path,
        allocatedBytes: VSCODE_FOLDER_SIZE_BYTES,
        targetPaths: [candidate.path],
      },
      expect.objectContaining({ kind: 'outcome', path: candidate.path, outcome: 'removed' }),
    ]);
    expect(await isPresent(candidate.path)).toBe(false);
    expect(
      await isPresent(join(buildVscodeExtensionsPath({ home: environment }), OLDER_FOLDER_NAME)),
    ).toBe(true);
  });

  test('leaves the folder alone once a profile lists it after the scan', async () => {
    const candidate = await scanVscodeCandidate();

    await writeFixtureTextFile({
      path: join(
        buildVscodeProfilesPath({ environment: environment }),
        FIXTURE_PROFILE_ID,
        'extensions.json',
      ),
      text: buildVscodeRegistryText({
        pathRules: environment.pathRules,
        extensionsPath: buildVscodeExtensionsPath({ home: environment }),
        folderNames: [OBSOLETE_FOLDER_NAME],
        form: 'locationOnly',
      }),
    });

    const run = await deleteVscodeCandidate({
      candidate: candidate,
      loadProcessCommands: buildProcessCommandsLoader([]),
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'changedSinceScan', freedBytes: 0 });
    expect(await isPresent(candidate.path)).toBe(true);
  });

  test('reads the processes afresh, so VS Code started after the confirmation keeps it', async () => {
    const candidate = await scanVscodeCandidate();
    const processReads: string[][] = [[], [VSCODE_HOST_PROCESS]];
    let readCount = 0;

    const run = await deleteVscodeCandidate({
      candidate: candidate,
      loadProcessCommands: async () => {
        readCount += 1;

        return processReads[readCount - 1] ?? [];
      },
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'ownerRunning', freedBytes: 0 });
    expect(readCount).toBe(2);
    expect(await isPresent(candidate.path)).toBe(true);
  });

  testOnPosix(
    'reports a denied read of a registry as a permission denial and keeps the folder',
    async () => {
      const candidate = await scanVscodeCandidate();

      await chmod(join(buildVscodeExtensionsPath({ home: environment }), 'extensions.json'), 0o000);

      const run = await deleteVscodeCandidate({
        candidate: candidate,
        loadProcessCommands: buildProcessCommandsLoader([]),
      });

      expect(run.outcomes[0]).toMatchObject({
        outcome: 'permissionDenied',
        code: 'EACCES',
        freedBytes: 0,
      });
      expect(await isPresent(candidate.path)).toBe(true);
    },
  );

  testOnPosix('reports any other failed read of a registry as failed with its code', async () => {
    const candidate = await scanVscodeCandidate();
    const registryPath = join(buildVscodeExtensionsPath({ home: environment }), 'extensions.json');

    await rm(registryPath);
    await symlink(registryPath, registryPath);

    const run = await deleteVscodeCandidate({
      candidate: candidate,
      loadProcessCommands: buildProcessCommandsLoader([]),
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'failed', code: 'ELOOP', freedBytes: 0 });
    expect(await isPresent(candidate.path)).toBe(true);
  });

  test('leaves a folder alone that was replaced after the scan', async () => {
    const candidate = await scanVscodeCandidate();

    await rm(candidate.path, { recursive: true });
    await createVscodeExtensionFolders({ home: environment, folderNames: [OBSOLETE_FOLDER_NAME] });

    const run = await deleteVscodeCandidate({
      candidate: candidate,
      loadProcessCommands: buildProcessCommandsLoader([]),
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'changedSinceScan', freedBytes: 0 });
    expect(await isPresent(join(candidate.path, 'package.json'))).toBe(true);
  });
});

describe('deleteCandidates with an item of several targets', () => {
  /** An item shown at the caches folder that goes as two of its folders, each scanned as it is. */
  async function scanTwoTargetsCandidate(params: {
    firstPath: string;
    secondPath: string;
  }): Promise<Candidate> {
    const allocatedBytes = await loadMeasuredAllocatedBytes({
      paths: [params.firstPath, params.secondPath],
    });

    return buildTestCandidate({
      path: join(fixtureRoot.homeDir, 'Library/Caches'),
      allocatedBytes: allocatedBytes,
      removal: {
        kind: 'deletePaths',
        targets: [await scanTarget(params.firstPath), await scanTarget(params.secondPath)],
        owner: { kind: 'none' },
      },
    });
  }

  async function deleteTargetsCandidate(params: {
    candidate: Candidate;
    journal: DeletionJournal;
  }): Promise<RemovalRun> {
    return deleteCandidates({
      candidates: [params.candidate],
      journal: params.journal,
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      clock: () => NOW_MS,
    });
  }

  test('deletes every target and records the intent with its targets, then an outcome for each', async () => {
    const firstPath = await createCacheFolder('first');
    const secondPath = await createCacheFolder('second');
    const sibling = await createCacheFolder('sibling');
    const candidate = await scanTwoTargetsCandidate({
      firstPath: firstPath,
      secondPath: secondPath,
    });
    const journal = await createFixtureRootJournal();

    const run = await deleteTargetsCandidate({ candidate: candidate, journal: journal });

    expect(run.outcomes).toEqual([
      {
        candidate: candidate,
        freedBytes: candidate.allocatedBytes,
        outcome: 'removed',
        code: null,
      },
    ]);
    expect(await loadJournalLines(journal)).toEqual([
      expect.objectContaining({ kind: 'sessionStart' }),
      {
        kind: 'intent',
        atMs: NOW_MS,
        path: candidate.path,
        allocatedBytes: candidate.allocatedBytes,
        targetPaths: [firstPath, secondPath],
      },
      { kind: 'outcome', atMs: NOW_MS, path: firstPath, outcome: 'removed', code: null },
      { kind: 'outcome', atMs: NOW_MS, path: secondPath, outcome: 'removed', code: null },
    ]);
    expect(await isPresent(firstPath)).toBe(false);
    expect(await isPresent(secondPath)).toBe(false);
    expect(await isPresent(join(sibling, 'nested/blob.bin'))).toBe(true);
  });

  test('deletes the other targets when one changed since the scan, and counts what went', async () => {
    const firstPath = await createCacheFolder('replaced');
    const secondPath = await createCacheFolder('kept-identity');
    const secondBytes = await loadMeasuredAllocatedBytes({ paths: [secondPath] });
    const candidate = await scanTwoTargetsCandidate({
      firstPath: firstPath,
      secondPath: secondPath,
    });
    const journal = await createFixtureRootJournal();

    await rm(firstPath, { recursive: true });
    await createCacheFolder('replaced');

    const run = await deleteTargetsCandidate({ candidate: candidate, journal: journal });

    expect(run.outcomes[0]).toMatchObject({
      outcome: 'changedSinceScan',
      freedBytes: secondBytes,
    });
    expect(await loadJournalLines(journal)).toMatchObject([
      { kind: 'sessionStart' },
      { kind: 'intent', targetPaths: [firstPath, secondPath] },
      { kind: 'outcome', path: firstPath, outcome: 'changedSinceScan' },
      { kind: 'outcome', path: secondPath, outcome: 'removed' },
    ]);
    expect(await isPresent(join(firstPath, 'nested/blob.bin'))).toBe(true);
    expect(await isPresent(secondPath)).toBe(false);
  });

  test('is removed when a target was gone already and the other deleted, counting only what this run deleted', async () => {
    const firstPath = await createCacheFolder('gone');
    const secondPath = await createCacheFolder('deleted');
    const secondBytes = await loadMeasuredAllocatedBytes({ paths: [secondPath] });
    const candidate = await scanTwoTargetsCandidate({
      firstPath: firstPath,
      secondPath: secondPath,
    });
    const journal = await createFixtureRootJournal();

    await rm(firstPath, { recursive: true });

    const run = await deleteTargetsCandidate({ candidate: candidate, journal: journal });

    expect(secondBytes).toBeLessThan(candidate.allocatedBytes);
    expect(run.outcomes[0]).toMatchObject({ outcome: 'removed', freedBytes: secondBytes });
    expect(await loadJournalLines(journal)).toMatchObject([
      { kind: 'sessionStart' },
      { kind: 'intent' },
      { kind: 'outcome', path: firstPath, outcome: 'alreadyGone' },
      { kind: 'outcome', path: secondPath, outcome: 'removed' },
    ]);
  });

  test('is already gone and frees nothing when every target is gone', async () => {
    const firstPath = await createCacheFolder('gone-first');
    const secondPath = await createCacheFolder('gone-second');
    const candidate = await scanTwoTargetsCandidate({
      firstPath: firstPath,
      secondPath: secondPath,
    });

    await rm(firstPath, { recursive: true });
    await rm(secondPath, { recursive: true });

    const run = await deleteTargetsCandidate({
      candidate: candidate,
      journal: await createFixtureRootJournal(),
    });

    expect(run.outcomes[0]).toMatchObject({ outcome: 'alreadyGone', freedBytes: 0 });
  });
});

describe('deleteCandidates with a Recycle Bin', () => {
  const DRIVE_ROOT_PATH = buildTestWindowsPath({ text: 'C:\\' });

  const SCANNED_CONTENT: RecycleBinContent = { sizeBytes: 8192, itemCount: 3 };

  const RECYCLE_BIN_CANDIDATE: CandidateRecycleBin = {
    ...buildTestCandidate({
      path: 'C:\\$Recycle.Bin',
      title: 'Recycle Bin (C:)',
      category: 'trash',
      risk: 'careful',
      allocatedBytes: SCANNED_CONTENT.sizeBytes,
      entryCount: SCANNED_CONTENT.itemCount,
    }),
    origin: { kind: 'recycleBin' },
    removal: {
      kind: 'emptyRecycleBin',
      driveRootPath: DRIVE_ROOT_PATH,
      scannedContent: SCANNED_CONTENT,
    },
  };

  /**
   * Runs the deletion of the bin and a path item after it with a fake Recycle Bin that counts
   * `freshContent` and empties as `emptied` says, and gives the drive roots it was asked to empty.
   */
  async function deleteWithFakeBin(params: {
    freshContent: Result<RecycleBinContent, string>;
    emptied: Result<null, string>;
  }): Promise<{ run: RemovalRun; emptiedRoots: string[]; journal: DeletionJournal }> {
    const emptiedRoots: string[] = [];
    const journal = await createFixtureRootJournal();
    const next = await createCacheFolder('after-bin');
    const run = await deleteCandidates({
      candidates: [RECYCLE_BIN_CANDIDATE, await scanCandidate(next)],
      journal: journal,
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      delete: {
        ...DELETION_PLATFORM.delete,
        trash: {
          kind: 'recycleBins',
          loadRecycleBin: () => params.freshContent,
          emptyRecycleBin: (emptyParams) => {
            emptiedRoots.push(emptyParams.driveRootPath);

            return params.emptied;
          },
        },
      },
      clock: () => NOW_MS,
    });

    return { run: run, emptiedRoots: emptiedRoots, journal: journal };
  }

  test('empties a bin that still holds what the scan counted, records it, and goes on', async () => {
    const { run, emptiedRoots, journal } = await deleteWithFakeBin({
      freshContent: { kind: 'succeeded', value: SCANNED_CONTENT },
      emptied: { kind: 'succeeded', value: null },
    });

    expect(emptiedRoots).toEqual(['C:\\']);
    expect(run.outcomes).toEqual([
      {
        candidate: RECYCLE_BIN_CANDIDATE,
        freedBytes: 8192,
        outcome: 'removed',
        code: null,
      },
      expect.objectContaining({ outcome: 'removed' }),
    ]);
    expect((await loadJournalLines(journal)).slice(1, 3)).toEqual([
      {
        kind: 'intent',
        atMs: NOW_MS,
        path: 'C:\\$Recycle.Bin',
        allocatedBytes: 8192,
        targetPaths: ['C:\\$Recycle.Bin'],
      },
      { kind: 'outcome', atMs: NOW_MS, path: 'C:\\$Recycle.Bin', outcome: 'removed', code: null },
    ]);
  });

  test('leaves a bin alone that gained or lost items since the scan', async () => {
    for (const freshContent of [
      { sizeBytes: 8192, itemCount: 4 },
      { sizeBytes: 12_288, itemCount: 3 },
    ]) {
      const { run, emptiedRoots } = await deleteWithFakeBin({
        freshContent: { kind: 'succeeded', value: freshContent },
        emptied: { kind: 'succeeded', value: null },
      });

      expect(emptiedRoots).toEqual([]);
      expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual([
        'changedSinceScan',
        'removed',
      ]);
    }
  });

  test('reports a bin emptied since the scan as already gone, never emptying it', async () => {
    const { run, emptiedRoots } = await deleteWithFakeBin({
      freshContent: { kind: 'succeeded', value: { sizeBytes: 0, itemCount: 0 } },
      emptied: { kind: 'succeeded', value: null },
    });

    expect(emptiedRoots).toEqual([]);
    expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual(['alreadyGone', 'removed']);
  });

  test('reports a failed count or a failed emptying with its error text, and goes on', async () => {
    const counted = await deleteWithFakeBin({
      freshContent: { kind: 'failed', failure: 'HRESULT 0x80070005' },
      emptied: { kind: 'succeeded', value: null },
    });
    const emptied = await deleteWithFakeBin({
      freshContent: { kind: 'succeeded', value: SCANNED_CONTENT },
      emptied: { kind: 'failed', failure: 'HRESULT 0x80070020' },
    });

    expect(counted.emptiedRoots).toEqual([]);
    expect(counted.run.outcomes).toMatchObject([
      { outcome: 'failed', code: 'HRESULT 0x80070005', freedBytes: 0 },
      { outcome: 'removed' },
    ]);
    expect(emptied.run.outcomes).toMatchObject([
      { outcome: 'failed', code: 'HRESULT 0x80070020', freedBytes: 0 },
      { outcome: 'removed' },
    ]);
  });

  test('fails a bin on a platform whose trash is a folder, never emptying anything', async () => {
    const run = await deleteCandidates({
      candidates: [RECYCLE_BIN_CANDIDATE],
      journal: await createFixtureRootJournal(),
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      delete: { ...DELETION_PLATFORM.delete, trash: { kind: 'catalogFolder' } },
      clock: () => NOW_MS,
    });

    expect(run.outcomes).toMatchObject([{ outcome: 'failed', code: null, freedBytes: 0 }]);
  });
});

describe('deleteCandidates with a path left partly in place', () => {
  test('measures what stayed, records the count of the entries left, and frees only the rest', async () => {
    const selected = await createCacheFolder('held');
    const candidate = { ...(await scanCandidate(selected)), allocatedBytes: 1_000_000_000 };
    const journal = await createFixtureRootJournal();

    // The fake removal leaves the whole tree, as when every file of it was held open.
    const run = await deleteCandidates({
      candidates: [candidate],
      journal: journal,
      loadProcessCommands: buildProcessCommandsLoader([]),
      environment: environment,
      ...DELETION_PLATFORM,
      delete: {
        ...DELETION_PLATFORM.delete,
        removeTree: async () => ({
          kind: 'succeeded',
          value: { kind: 'partlyRemoved', stayedEntryCount: 2 },
        }),
      },
      clock: () => NOW_MS,
    });
    const leftBytes = await loadMeasuredAllocatedBytes({ paths: [selected] });

    expect(leftBytes).toBeGreaterThan(0);
    expect(run.outcomes).toEqual([
      {
        candidate: candidate,
        freedBytes: 1_000_000_000 - leftBytes,
        outcome: 'partlyRemoved',
        stayedEntryCount: 2,
      },
    ]);
    expect((await loadJournalLines(journal)).at(-1)).toEqual({
      kind: 'outcome',
      atMs: NOW_MS,
      path: selected,
      outcome: 'partlyRemoved',
      stayedEntryCount: 2,
    });
  });
});

describe('isUnremovedOutcome', () => {
  test('is true only for the outcomes that left their item or part of it through a failure', () => {
    const kinds: RemovalOutcomeKind[] = [
      'removed',
      'partlyRemoved',
      'alreadyGone',
      'changedSinceScan',
      'ownerRunning',
      'permissionDenied',
      'failed',
      'notAttempted',
      'toolFailed',
      'engineInUse',
      'engineNotRunning',
    ];

    expect(kinds.filter(isUnremovedOutcome)).toEqual([
      'partlyRemoved',
      'permissionDenied',
      'failed',
      'toolFailed',
    ]);
  });
});

describe('toolCandidateRunToRemoval', () => {
  const TOOL_PATH = '/Users/tester/.local/share/mise/installs/node/20.1.0';
  const toolCandidate = buildTestToolCandidate({
    home: buildExampleHome({ text: '/Users/tester' }),
    version: '20.1.0',
    allocatedBytes: 8192,
  });

  test('a completed run is removed with its measured drop and the stderr tail', () => {
    expect(
      toolCandidateRunToRemoval({
        candidate: toolCandidate,
        run: { kind: 'completed', freedBytes: 6144, stderrTail: 'removed node@20.1.0' },
        atMs: NOW_MS,
      }),
    ).toEqual({
      outcome: {
        candidate: toolCandidate,
        freedBytes: 6144,
        outcome: 'removed',
        code: null,
      },
      outcomeEntries: [
        {
          kind: 'toolOutcome',
          atMs: NOW_MS,
          path: TOOL_PATH,
          outcome: 'removed',
          exitCode: 0,
          stderrTail: 'removed node@20.1.0',
          freedBytes: 6144,
        },
      ],
    });
  });

  test('a skipped run frees nothing and records its reason', () => {
    expect(
      toolCandidateRunToRemoval({
        candidate: toolCandidate,
        run: { kind: 'skipped', reason: 'ownerRunning' },
        atMs: NOW_MS,
      }),
    ).toEqual({
      outcome: {
        candidate: toolCandidate,
        freedBytes: 0,
        outcome: 'ownerRunning',
        code: null,
      },
      outcomeEntries: [
        { kind: 'toolOutcome', atMs: NOW_MS, path: TOOL_PATH, outcome: 'ownerRunning' },
      ],
    });
  });

  test('a failed run keeps what it freed and its failure', () => {
    const failure = {
      reason: 'commandFailed',
      failure: { reason: 'exitedWithError', exitCode: 1, stderrTail: 'locked' },
    } as const;

    expect(
      toolCandidateRunToRemoval({
        candidate: toolCandidate,
        run: { kind: 'failed', freedBytes: 1024, failure: failure },
        atMs: NOW_MS,
      }),
    ).toEqual({
      outcome: {
        candidate: toolCandidate,
        freedBytes: 1024,
        outcome: 'toolFailed',
        failure: failure,
      },
      outcomeEntries: [
        {
          kind: 'toolOutcome',
          atMs: NOW_MS,
          path: TOOL_PATH,
          outcome: 'toolFailed',
          freedBytes: 1024,
          failure: failure,
        },
      ],
    });
  });
});
