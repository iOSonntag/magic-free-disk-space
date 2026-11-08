import { expect } from 'bun:test';
import { readFile, realpath, rm, truncate, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import type { RecordedRemoval } from '../../src/delete/deleteCandidates.js';
import { evictCandidateFiles } from '../../src/delete/evictCandidateFiles.js';
import type { EvictTarget } from '../../src/scan/candidate.js';
import { loadEntryStats } from '../../src/system/loadEntryStats.js';
import { loadFileIdentity } from '../../src/system/loadFileIdentity.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { loadEntryAllocatedBytes } from '../support/entryReadsFixtures.js';
import { buildTestEvictCandidate } from '../support/evictCandidateFixtures.js';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureFile, loadTestEnvironment, withFixtureRoot } from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';

const NOW_MS = Date.UTC(2026, 9, 1);
const OLD_MS = Date.UTC(2026, 0, 1);
/** The fake `brctl` refuses a file of this name, as the real one may for any file. */
const REFUSED_FILE_NAME = 'refused.txt';
/** The mode of a tool only its owner may change. */
const TRUSTED_TOOL_MODE = 0o755;

function getCloudDocsPath(params: { fixtureRoot: FixtureRoot }): string {
  return join(params.fixtureRoot.homeDir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
}

function getToolLogPath(params: { fixtureRoot: FixtureRoot }): string {
  return join(params.fixtureRoot.rootDir, 'brctl-calls.jsonl');
}

/** A fake `brctl` that logs its arguments and exits 1 for the refused file, else 0. */
async function createFakeBrctl(params: {
  fixtureRoot: FixtureRoot;
  mode?: number;
}): Promise<string> {
  const logPath = getToolLogPath({ fixtureRoot: params.fixtureRoot });
  const path = await createFakeTool({
    folder: join(params.fixtureRoot.rootDir, 'tools'),
    name: 'brctl',
    body: `import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(args) + '\\n');
process.exit((args[1] ?? '').endsWith(${JSON.stringify(REFUSED_FILE_NAME)}) ? 1 : 0);`,
    mode: params.mode ?? TRUSTED_TOOL_MODE,
  });

  return realpath(path);
}

async function loadToolCalls(params: { fixtureRoot: FixtureRoot }): Promise<string[][]> {
  try {
    const text = await readFile(getToolLogPath({ fixtureRoot: params.fixtureRoot }), 'utf8');

    return text
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/** A downloaded file iCloud Drive keeps, untouched since `OLD_MS`, as the scan found it. */
async function createScannedFile(params: { path: string }): Promise<EvictTarget> {
  await createFixtureFile({ path: params.path, sizeBytes: 8192, modifiedMs: OLD_MS });

  const identity = await loadFileIdentity({ path: params.path });
  const stats = await loadEntryStats({ path: params.path });

  if (identity.kind === 'failed' || stats.kind === 'failed') {
    throw new Error(`The fixture file ${params.path} cannot be read.`);
  }

  return {
    path: params.path,
    identity: identity.value,
    modifiedMs: stats.value.modifiedMs,
    accessedMs: stats.value.accessedMs,
  };
}

/** Evicts the targets as one evict item of the fixture's iCloud Drive with the tool at `toolPath`. */
async function evictTestCandidateFiles(params: {
  fixtureRoot: FixtureRoot;
  toolPath: string;
  targets: [EvictTarget, ...EvictTarget[]];
}): Promise<RecordedRemoval> {
  const candidate = buildTestEvictCandidate({
    folderPath: getCloudDocsPath({ fixtureRoot: params.fixtureRoot }),
    targets: params.targets,
    toolPath: params.toolPath,
  });

  if (candidate.removal.kind !== 'evictUnitFiles') {
    throw new Error('The fixture candidate is no evict.');
  }

  return evictCandidateFiles({
    candidate: candidate,
    removal: candidate.removal,
    environment: await loadTestEnvironment({ fixtureRoot: params.fixtureRoot, nowMs: NOW_MS }),
    clock: () => NOW_MS,
  });
}

describeAwaitingWin32Platform('evictCandidateFiles with a fake brctl', () => {
  testOnPosix('evicts each unchanged file by its own call and frees its blocks', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const cloudDocs = getCloudDocsPath({ fixtureRoot: fixtureRoot });
        const first = await createScannedFile({ path: join(cloudDocs, 'Docs', 'a.txt') });
        const second = await createScannedFile({ path: join(cloudDocs, 'Docs', 'b.txt') });
        const toolPath = await createFakeBrctl({ fixtureRoot: fixtureRoot });
        const blocks =
          (await loadEntryAllocatedBytes({ path: first.path })) +
          (await loadEntryAllocatedBytes({ path: second.path }));

        const recorded = await evictTestCandidateFiles({
          fixtureRoot: fixtureRoot,
          toolPath: toolPath,
          targets: [first, second],
        });

        expect(await loadToolCalls({ fixtureRoot: fixtureRoot })).toEqual([
          ['evict', first.path],
          ['evict', second.path],
        ]);
        expect(blocks).toBeGreaterThan(0);
        expect(recorded.outcome).toMatchObject({
          outcome: 'removed',
          code: null,
          freedBytes: blocks,
        });
        expect(recorded.outcomeEntries).toEqual([
          { kind: 'eviction', atMs: NOW_MS, path: first.path, outcome: 'removed', code: null },
          { kind: 'eviction', atMs: NOW_MS, path: second.path, outcome: 'removed', code: null },
        ]);
      },
    });
  });

  testOnPosix('keeps a file changed, read, emptied, or gone since the scan', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const cloudDocs = getCloudDocsPath({ fixtureRoot: fixtureRoot });
        const changed = await createScannedFile({ path: join(cloudDocs, 'changed.txt') });
        const read = await createScannedFile({ path: join(cloudDocs, 'read.txt') });
        const emptied = await createScannedFile({ path: join(cloudDocs, 'emptied.txt') });
        const gone = await createScannedFile({ path: join(cloudDocs, 'gone.txt') });
        const toolPath = await createFakeBrctl({ fixtureRoot: fixtureRoot });

        await utimes(changed.path, new Date(OLD_MS), new Date(OLD_MS + 1000));
        await utimes(read.path, new Date(OLD_MS + 1000), new Date(OLD_MS));
        // Its blocks are gone, as an evict elsewhere takes them; the times stay the scan's.
        await truncate(emptied.path, 0);
        await utimes(emptied.path, new Date(OLD_MS), new Date(OLD_MS));
        await rm(gone.path);

        const recorded = await evictTestCandidateFiles({
          fixtureRoot: fixtureRoot,
          toolPath: toolPath,
          targets: [changed, read, emptied, gone],
        });

        expect(await loadToolCalls({ fixtureRoot: fixtureRoot })).toEqual([]);
        expect(recorded.outcome).toMatchObject({ outcome: 'changedSinceScan', freedBytes: 0 });
        expect(
          recorded.outcomeEntries.map((entry) => entry.kind === 'eviction' && entry.outcome),
        ).toEqual(['changedSinceScan', 'changedSinceScan', 'changedSinceScan', 'alreadyGone']);
      },
    });
  });

  testOnPosix('keeps the file brctl exits non-zero for, and evicts the others', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const cloudDocs = getCloudDocsPath({ fixtureRoot: fixtureRoot });
        const refused = await createScannedFile({ path: join(cloudDocs, REFUSED_FILE_NAME) });
        const evicted = await createScannedFile({ path: join(cloudDocs, 'evicted.txt') });
        const toolPath = await createFakeBrctl({ fixtureRoot: fixtureRoot });
        const evictedBytes = await loadEntryAllocatedBytes({ path: evicted.path });

        const recorded = await evictTestCandidateFiles({
          fixtureRoot: fixtureRoot,
          toolPath: toolPath,
          targets: [refused, evicted],
        });
        const toolFailure = {
          reason: 'commandFailed',
          failure: { reason: 'exitedWithError', exitCode: 1 },
        };

        expect(await loadToolCalls({ fixtureRoot: fixtureRoot })).toEqual([
          ['evict', refused.path],
          ['evict', evicted.path],
        ]);
        expect(recorded.outcome).toMatchObject({
          outcome: 'toolFailed',
          failure: toolFailure,
          freedBytes: evictedBytes,
        });
        expect(recorded.outcomeEntries).toMatchObject([
          { kind: 'eviction', path: refused.path, outcome: 'toolFailed', failure: toolFailure },
          { kind: 'eviction', path: evicted.path, outcome: 'removed', code: null },
        ]);
      },
    });
  });

  testOnPosix('evicts nothing once the tool is no longer the one the scan trusted', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const target = await createScannedFile({
          path: join(getCloudDocsPath({ fixtureRoot: fixtureRoot }), 'a.txt'),
        });
        // Anyone may write it now, so whatever it runs is no longer known.
        const toolPath = await createFakeBrctl({ fixtureRoot: fixtureRoot, mode: 0o777 });

        const recorded = await evictTestCandidateFiles({
          fixtureRoot: fixtureRoot,
          toolPath: toolPath,
          targets: [target],
        });

        expect(await loadToolCalls({ fixtureRoot: fixtureRoot })).toEqual([]);
        expect(recorded.outcome).toMatchObject({ outcome: 'changedSinceScan', freedBytes: 0 });
        expect(recorded.outcomeEntries).toEqual([
          {
            kind: 'eviction',
            atMs: NOW_MS,
            path: target.path,
            outcome: 'changedSinceScan',
            code: null,
          },
        ]);
      },
    });
  });
});
