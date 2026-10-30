import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deleteCandidates } from '../../src/delete/deleteCandidates.js';
import type { DeletionJournal } from '../../src/delete/deletionJournal.js';
import { createDeletionJournal } from '../../src/delete/deletionJournal.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreToolUnit } from '../../src/explore/exploreUnit.js';
import type { Candidate } from '../../src/scan/candidate.js';
import { loadUnitMeasurement } from '../../src/scan/loadUnitMeasurement.js';
import { loadFileIdentity } from '../../src/system/loadFileIdentity.js';
import { createUnitRunFakeTool } from '../explore/probeFakeTools.js';
import { buildMisePrunableJson } from '../explore/probeOutputFixtures.js';
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

async function createFolderWithFile(path: string): Promise<void> {
  await mkdir(join(path, 'nested'), { recursive: true });
  await createFixtureFile({
    path: join(path, 'nested/blob.bin'),
    sizeBytes: 8192,
    modifiedMs: NOW_MS,
  });
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

async function measureAllocatedBytes(candidate: Candidate): Promise<number> {
  const measurement = await loadUnitMeasurement({
    unit: readToolUnit(candidate),
    deadlineMs: Date.now() + 60_000,
  });

  return measurement.allocatedBytes;
}

/** Scans a fixture path the way the scanner does, so the candidate carries its real identity. */
async function scanCandidate(path: string): Promise<Candidate> {
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
    removal: { kind: 'deletePath', identity: identity.value, ownerBundlePaths: [] },
    evidenceLines: [],
  };
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
      processCommands: [],
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
      processCommands: [],
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
      processCommands: [],
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
      processCommands: [],
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
});
