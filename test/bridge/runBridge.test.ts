import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { BridgeEnd, BridgeEvent } from '../../src/bridge/runBridge.js';
import { runBridge } from '../../src/bridge/runBridge.js';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { EnvironmentFailure } from '../../src/environment/loadEnvironment.js';
import type { Result } from '../../src/result.js';
import {
  buildTestCatalogEntry,
  TOOL_INSTALL_LOCATIONS_NONE,
} from '../support/candidateFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';

const MIB = 1_048_576;
const HOUR_MS = 3_600_000;
const NOW_MS = Date.now();

// Ranked by size: 1 the tool cache (safe), 2 the app cache (review), 3 the kept store (never).
const BRIDGE_CATALOG: CatalogEntry[] = [
  buildTestCatalogEntry({
    id: 'tool-cache',
    title: 'Tool cache',
    path: 'Library/Caches/ToolCache',
    risk: 'safe',
  }),
  buildTestCatalogEntry({
    id: 'app-cache',
    title: 'App cache',
    path: 'Library/Caches/AppCache',
    risk: 'review',
  }),
  buildTestCatalogEntry({
    id: 'kept-store',
    title: 'Kept store',
    path: 'Library/KeptStore',
    risk: 'never',
  }),
  buildTestCatalogEntry({
    id: 'tool-store',
    title: 'Tool store',
    path: 'Library/ToolStore',
    risk: 'review',
    removal: { kind: 'advice', advice: 'Run the tool prune command.' },
  }),
];

const SCAN_LINE = '{"kind":"scan"}';

let fixtureRoot: FixtureRoot;
let environment: Environment;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });

  const home = fixtureRoot.homeDir;

  await createSizedFile({ path: join(home, 'Library/Caches/ToolCache/blob.bin'), mib: 4 });
  await createSizedFile({ path: join(home, 'Library/Caches/AppCache/blob.bin'), mib: 3 });
  await createSizedFile({ path: join(home, 'Library/KeptStore/blob.bin'), mib: 2 });
  await createSizedFile({ path: join(home, 'Library/ToolStore/store.bin'), mib: 5 });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function* yieldLines(lines: string[]): AsyncGenerator<string> {
  for (const line of lines) {
    yield line;
  }
}

async function createSizedFile(params: { path: string; mib: number }): Promise<void> {
  await mkdir(join(params.path, '..'), { recursive: true });
  await createFixtureFile({ path: params.path, sizeBytes: params.mib * MIB, modifiedMs: NOW_MS });
}

/** Every file and folder under the fixture root, except the log folder a deletion creates. */
async function listFixturePaths(): Promise<string[]> {
  const entries = await readdir(fixtureRoot.rootDir, { recursive: true });

  return entries
    .map((entry) => relative(fixtureRoot.rootDir, join(fixtureRoot.rootDir, entry)))
    .filter((path) => !path.startsWith('home/Library/Logs'))
    .toSorted();
}

/** The time of every entry of the deletion log, in the order written. */
async function loadJournalTimes(): Promise<unknown[]> {
  const logText = await readFile(environment.deletionLogPath, 'utf8');

  return logText
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line).atMs);
}

async function runBridgeWithLines(params: {
  lines: string[];
  nowMs?: number;
  environmentResult?: Result<Environment, EnvironmentFailure>;
}): Promise<{ end: BridgeEnd; events: BridgeEvent[] }> {
  const events: BridgeEvent[] = [];
  const environmentResult: Result<Environment, EnvironmentFailure> = params.environmentResult ?? {
    kind: 'succeeded',
    value: environment,
  };
  const end = await runBridge({
    io: {
      readLines: () => yieldLines(params.lines),
      writeEvent: (event) => {
        events.push(event);
      },
    },
    catalogEntries: BRIDGE_CATALOG,
    toolInstallLocations: TOOL_INSTALL_LOCATIONS_NONE,
    loadEnvironment: async () => environmentResult,
    clock: () => params.nowMs ?? NOW_MS,
  });

  return { end: end, events: events };
}

/** The final events, one per request, without the progress events of a scan. */
function findAnswers(params: { events: BridgeEvent[] }): BridgeEvent[] {
  return params.events.filter((event) => event.kind !== 'progress');
}

function buildPlanLine(params: { numbers: number[] }): string {
  return JSON.stringify({ kind: 'plan', numbers: params.numbers });
}

function buildDeleteLine(params: { planId: number; confirmation: string }): string {
  return JSON.stringify({
    kind: 'delete',
    planId: params.planId,
    confirmation: params.confirmation,
  });
}

/**
 * Checks every produced event against the fixture line of its kind, key by key at every depth,
 * so the Dart parser, whose test reads the same fixture, cannot drift from the bridge.
 */
async function expectEventsMatchProtocolFixture(params: { events: BridgeEvent[] }): Promise<void> {
  const fixtureText = await readFile(join(import.meta.dir, 'bridgeEvents.jsonl'), 'utf8');
  const fixtureEvents: unknown[] = fixtureText
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line));
  const producedKinds = new Set(params.events.map((event) => event.kind));

  expect([...producedKinds].toSorted()).toEqual([
    'cancelled',
    'deleted',
    'failed',
    'nothingApproved',
    'planned',
    'progress',
    'scanned',
  ]);

  for (const event of params.events) {
    const fixtureEvent = fixtureEvents.find((candidate) => hasKind(candidate, event.kind));

    expect(buildKeyShape(event)).toEqual(buildKeyShape(fixtureEvent));
  }
}

function hasKind(value: unknown, kind: string): boolean {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === kind;
}

/** The keys of a value at every depth with the type of each leaf; an array by its first item. */
function buildKeyShape(value: unknown): Record<string, unknown> | string {
  if (Array.isArray(value)) {
    return value.length === 0 ? 'array' : { items: buildKeyShape(value[0]) };
  }

  if (typeof value === 'object' && value !== null) {
    const shape: Record<string, unknown> = {};

    for (const [key, fieldValue] of Object.entries(value)) {
      shape[key] = buildKeyShape(fieldValue);
    }

    return shape;
  }

  return typeof value;
}

describe('runBridge', () => {
  test('scans and answers with the display texts of the ranking', async () => {
    const { end, events } = await runBridgeWithLines({ lines: [SCAN_LINE] });
    const answers = findAnswers({ events: events });

    expect(end).toBe('inputEnded');
    expect(events.some((event) => event.kind === 'progress')).toBe(true);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      kind: 'scanned',
      summaryText: 'Found 3 items, 9.0 MiB in total',
      candidates: [
        { number: 1, title: 'Tool cache', risk: 'safe', sizeText: '4.0 MiB' },
        { number: 2, title: 'App cache', risk: 'review', sizeText: '3.0 MiB' },
        { number: 3, title: 'Kept store', risk: 'never', sizeText: '2.0 MiB' },
      ],
    });
  });

  test('deletes exactly the confirmed plan, then needs a new scan', async () => {
    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [
        SCAN_LINE,
        buildPlanLine({ numbers: [2] }),
        buildDeleteLine({ planId: 1, confirmation: 'DELETE' }),
        buildPlanLine({ numbers: [1] }),
      ],
    });
    const after = await listFixturePaths();
    const answers = findAnswers({ events: events });

    expect(answers.map((answer) => answer.kind)).toEqual([
      'scanned',
      'planned',
      'deleted',
      'failed',
    ]);
    expect(answers[1]).toMatchObject({
      planId: 1,
      warningLines: [
        'This cannot be undone: the items do not go to the Trash.',
        'Type DELETE to delete them permanently.',
        'Anything else cancels.',
      ],
    });
    expect(answers[3]).toMatchObject({ isScanDropped: true });
    expect(before.filter((path) => !after.includes(path))).toEqual([
      'home/Library/Caches/AppCache',
      'home/Library/Caches/AppCache/blob.bin',
    ]);
    expect(await loadJournalTimes()).toEqual([NOW_MS, NOW_MS, NOW_MS]);
  });

  test('a failed plan drops the plan before it, so its id deletes nothing', async () => {
    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [
        SCAN_LINE,
        buildPlanLine({ numbers: [1] }),
        buildPlanLine({ numbers: [1, 99] }),
        buildDeleteLine({ planId: 1, confirmation: 'DELETE' }),
      ],
    });

    expect(findAnswers({ events: events }).slice(1)).toEqual([
      expect.objectContaining({ kind: 'planned', planId: 1 }),
      { kind: 'failed', message: 'No item has the number 99.', isScanDropped: false },
      {
        kind: 'failed',
        message: 'No deletion waits for its confirmation; review it again.',
        isScanDropped: false,
      },
    ]);
    expect(await listFixturePaths()).toEqual(before);
  });

  test('deletes the latest plan only: an older plan id deletes nothing', async () => {
    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [
        SCAN_LINE,
        buildPlanLine({ numbers: [1] }),
        buildPlanLine({ numbers: [2] }),
        buildDeleteLine({ planId: 1, confirmation: 'DELETE' }),
      ],
    });

    expect(findAnswers({ events: events }).at(-1)).toMatchObject({
      kind: 'failed',
      isScanDropped: false,
    });
    expect(await listFixturePaths()).toEqual(before);
  });

  test('anything but the exact word cancels, deletes nothing, and drops the plan', async () => {
    const before = await listFixturePaths();

    for (const confirmation of ['delete', 'yes', 'DELETE please', '']) {
      const { events } = await runBridgeWithLines({
        lines: [
          SCAN_LINE,
          buildPlanLine({ numbers: [1, 2] }),
          buildDeleteLine({ planId: 1, confirmation: confirmation }),
          buildDeleteLine({ planId: 1, confirmation: 'DELETE' }),
        ],
      });

      expect(findAnswers({ events: events }).slice(2)).toEqual([
        { kind: 'cancelled', message: 'Cancelled. Nothing was deleted.' },
        {
          kind: 'failed',
          message: 'No deletion waits for its confirmation; review it again.',
          isScanDropped: false,
        },
      ]);
    }

    expect(await listFixturePaths()).toEqual(before);
  });

  test('a plan of refused items only answers nothingApproved and leaves nothing to delete', async () => {
    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [
        SCAN_LINE,
        buildPlanLine({ numbers: [3] }),
        buildDeleteLine({ planId: 1, confirmation: 'DELETE' }),
      ],
    });
    const answers = findAnswers({ events: events });

    expect(answers[1]).toMatchObject({ kind: 'nothingApproved' });
    expect(answers[2]).toMatchObject({ kind: 'failed', isScanDropped: false });
    expect(await listFixturePaths()).toEqual(before);
  });

  test('a scan older than an hour is refused and dropped', async () => {
    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [SCAN_LINE, buildPlanLine({ numbers: [1] })],
      nowMs: NOW_MS + HOUR_MS + 1,
    });

    expect(findAnswers({ events: events })[1]).toEqual({
      kind: 'failed',
      message: 'The scan is older than an hour; scan again.',
      isScanDropped: true,
    });
    expect(await listFixturePaths()).toEqual(before);
  });

  test('a number outside the ranking, a bad line, or a plan before a scan fails and deletes nothing', async () => {
    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [
        buildPlanLine({ numbers: [1] }),
        'not json',
        '{"kind":"remove","numbers":[1]}',
        SCAN_LINE,
        buildPlanLine({ numbers: [1, 4] }),
      ],
    });
    const answers = findAnswers({ events: events });

    expect(answers.map((answer) => answer.kind)).toEqual([
      'failed',
      'failed',
      'failed',
      'scanned',
      'failed',
    ]);
    expect(answers[4]).toEqual({
      kind: 'failed',
      message: 'No item has the number 4.',
      isScanDropped: false,
    });
    expect(await listFixturePaths()).toEqual(before);
  });

  test('a log that cannot be created deletes nothing and keeps the scan', async () => {
    await writeFile(join(fixtureRoot.homeDir, 'Library/Logs'), 'a file where the folder belongs');

    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [
        SCAN_LINE,
        buildPlanLine({ numbers: [1] }),
        buildDeleteLine({ planId: 1, confirmation: 'DELETE' }),
      ],
    });
    const answers = findAnswers({ events: events });

    expect(answers[2]).toMatchObject({ kind: 'failed', isScanDropped: false });
    expect(answers[2]).toHaveProperty('message', expect.stringContaining('Nothing was deleted.'));
    expect(await listFixturePaths()).toEqual(before);
  });

  test('answers no blank line', async () => {
    const { events } = await runBridgeWithLines({ lines: ['', '  ', SCAN_LINE, ''] });

    expect(findAnswers({ events: events }).map((answer) => answer.kind)).toEqual(['scanned']);
  });

  test('refuses to start in an unsafe environment and reads no request', async () => {
    const before = await listFixturePaths();
    const { end, events } = await runBridgeWithLines({
      lines: [SCAN_LINE],
      environmentResult: { kind: 'failed', failure: { reason: 'runAsRoot' } },
    });

    expect(end).toBe('cannotStart');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'failed', isScanDropped: true });
    expect(await listFixturePaths()).toEqual(before);
  });

  test('every event matches the protocol fixture the app is tested with', async () => {
    const { events } = await runBridgeWithLines({
      lines: [
        SCAN_LINE,
        buildPlanLine({ numbers: [3] }),
        buildPlanLine({ numbers: [1] }),
        buildDeleteLine({ planId: 1, confirmation: 'no' }),
        buildPlanLine({ numbers: [99] }),
        buildPlanLine({ numbers: [1] }),
        buildDeleteLine({ planId: 2, confirmation: 'DELETE' }),
      ],
    });

    await expectEventsMatchProtocolFixture({ events: events });
  });
});
