import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { BridgeEnd, BridgeEvent } from '../../src/bridge/runBridge.js';
import { runBridge } from '../../src/bridge/runBridge.js';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { EnvironmentFailure } from '../../src/environment/loadEnvironment.js';
import type { PreferencesSaveFailure } from '../../src/preferences/preferencesFile.js';
import { FULL_DISK_ACCESS_SETTINGS_LINK } from '../../src/report/noticeView.js';
import type { Result } from '../../src/result.js';
import type { FullDiskAccess } from '../../src/system/fullDiskAccess.js';
import type { LatestReleaseFetchResult } from '../../src/update/fetchLatestReleaseVersion.js';
import type { ReleaseVersion } from '../../src/update/releaseVersion.js';
import { AWAITS_WIN32_PLATFORM } from '../support/awaitsWin32Platform.js';
import {
  buildTestCatalogEntry,
  TOOL_INSTALL_LOCATIONS_NONE,
} from '../support/candidateFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { loadProtocolFixtureEvents } from '../support/protocolFixture.js';

const MIB = 1_048_576;
const HOUR_MS = 3_600_000;
const NOW_MS = Date.now();

// One section, Caches: 1 the tool cache (safe), then under "Check before deleting" 2 the app cache
// (review) and 3 the kept store (never). The tool store is advice; the tiny cache is skipped.
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
  buildTestCatalogEntry({
    id: 'tiny-cache',
    title: 'Tiny cache',
    path: 'Library/Caches/TinyCache',
    risk: 'safe',
  }),
];

const SCAN_LINE = '{"kind":"scan"}';

const STATUS_LINE = '{"kind":"status"}';

const CHECK_UPDATE_LINE = '{"kind":"checkUpdate"}';

const RELEASE_1_2_0: ReleaseVersion = { major: 1, minor: 2, patch: 0 };

const RELEASE_1_3_0: ReleaseVersion = { major: 1, minor: 3, patch: 0 };

function buildSetUpdateCheckLine(params: { isEnabled: boolean }): string {
  return JSON.stringify({ kind: 'setUpdateCheck', isEnabled: params.isEnabled });
}

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
  await createSizedFile({ path: join(home, 'Library/Caches/TinyCache/blob.bin'), mib: 0.5 });
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

/**
 * Runs the bridge on the fixture home. Its Full Disk Access probe, the latest release, and the
 * preference file are fakes that answer as told and record their calls.
 */
async function runBridgeWithLines(params: {
  lines: string[];
  nowMs?: number;
  environmentResult?: Result<Environment, EnvironmentFailure>;
  fullDiskAccess?: FullDiskAccess;
  releaseVersion?: ReleaseVersion | null;
  latestRelease?: LatestReleaseFetchResult;
  isUpdateCheckEnabled?: boolean;
  saveResult?: Result<null, PreferencesSaveFailure>;
}): Promise<{
  end: BridgeEnd;
  events: BridgeEvent[];
  probedHomeDirs: string[];
  fetchCount: number;
  preferenceHomeDirs: string[];
  savedValues: boolean[];
}> {
  const events: BridgeEvent[] = [];
  const probedHomeDirs: string[] = [];
  const preferenceHomeDirs: string[] = [];
  const savedValues: boolean[] = [];
  let fetchCount = 0;
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
    loadFullDiskAccess: async (probe) => {
      probedHomeDirs.push(probe.homeDir);

      return params.fullDiskAccess ?? 'unknown';
    },
    clock: () => params.nowMs ?? NOW_MS,
    releaseVersion: params.releaseVersion === undefined ? RELEASE_1_2_0 : params.releaseVersion,
    fetchLatestReleaseVersion: async () => {
      fetchCount += 1;

      return params.latestRelease ?? { kind: 'succeeded', value: RELEASE_1_3_0 };
    },
    loadPreferences: async (load) => {
      preferenceHomeDirs.push(load.homeDir);

      return { isUpdateCheckEnabled: params.isUpdateCheckEnabled ?? true };
    },
    saveIsUpdateCheckEnabled: async (save) => {
      preferenceHomeDirs.push(save.homeDir);
      savedValues.push(save.isEnabled);

      return params.saveResult ?? { kind: 'succeeded', value: null };
    },
  });

  return {
    end: end,
    events: events,
    probedHomeDirs: probedHomeDirs,
    fetchCount: fetchCount,
    preferenceHomeDirs: preferenceHomeDirs,
    savedValues: savedValues,
  };
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
 * Checks every produced event, as it goes over the wire, against the fixture lines of its kind,
 * key by key at every depth, so the Dart parser, whose test reads the same fixture, cannot drift
 * from the bridge.
 */
async function expectEventsMatchProtocolFixture(params: { events: BridgeEvent[] }): Promise<void> {
  const fixtureEvents = await loadProtocolFixtureEvents();
  const producedKinds = new Set(params.events.map((event) => event.kind));

  expect([...producedKinds].toSorted()).toEqual([
    'cancelled',
    'deleted',
    'failed',
    'nothingApproved',
    'planned',
    'progress',
    'scanned',
    'status',
    'updateCheckSet',
    'updateChecked',
  ]);

  const mismatches = params.events.flatMap((event) =>
    listShapeMismatches({
      value: JSON.parse(JSON.stringify(event)),
      fixtureValues: fixtureEvents.filter(
        (fixtureEvent) => isJsonRecord(fixtureEvent) && fixtureEvent.kind === event.kind,
      ),
      place: event.kind,
    }),
  );

  expect(mismatches).toEqual([]);
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Compares a value with every fixture value at its place, the items of all the fixture's arrays
 * there included: an object by its keys and each field, a leaf by its type. `null` passes only
 * where the fixture shows `null` at that place too; an empty array holds nothing to compare.
 */
function listShapeMismatches(params: {
  value: unknown;
  fixtureValues: unknown[];
  place: string;
}): string[] {
  if (params.value === null) {
    return params.fixtureValues.includes(null)
      ? []
      : [`${params.place}: null, which the fixture never shows here`];
  }

  const filledFixtureValues = params.fixtureValues.filter((fixtureValue) => fixtureValue !== null);

  if (filledFixtureValues.length === 0) {
    return [`${params.place}: a value, where the fixture shows none filled`];
  }

  if (Array.isArray(params.value)) {
    return listArrayShapeMismatches({
      items: params.value,
      fixtureValues: filledFixtureValues,
      place: params.place,
    });
  }

  if (isJsonRecord(params.value)) {
    return listRecordShapeMismatches({
      record: params.value,
      fixtureValues: filledFixtureValues,
      place: params.place,
    });
  }

  const valueType = typeof params.value;
  const hasSameType = filledFixtureValues.every(
    (fixtureValue) => typeof fixtureValue === valueType,
  );

  return hasSameType ? [] : [`${params.place}: a ${valueType}, unlike the fixture`];
}

function listArrayShapeMismatches(params: {
  items: unknown[];
  fixtureValues: unknown[];
  place: string;
}): string[] {
  const fixtureArrays = params.fixtureValues.filter((fixtureValue) => Array.isArray(fixtureValue));

  if (fixtureArrays.length !== params.fixtureValues.length) {
    return [`${params.place}: an array, unlike the fixture`];
  }

  const fixtureItems = fixtureArrays.flat();

  return params.items.flatMap((item, index) =>
    listShapeMismatches({
      value: item,
      fixtureValues: fixtureItems,
      place: `${params.place}[${index}]`,
    }),
  );
}

function listRecordShapeMismatches(params: {
  record: Record<string, unknown>;
  fixtureValues: unknown[];
  place: string;
}): string[] {
  const fixtureRecords = params.fixtureValues.filter(isJsonRecord);

  if (fixtureRecords.length !== params.fixtureValues.length) {
    return [`${params.place}: an object, unlike the fixture`];
  }

  const keysText = Object.keys(params.record).toSorted().join(', ');
  const fixtureKeysTexts = new Set(
    fixtureRecords.map((fixtureRecord) => Object.keys(fixtureRecord).toSorted().join(', ')),
  );
  const keyMismatches = [...fixtureKeysTexts].flatMap((fixtureKeysText) =>
    fixtureKeysText === keysText
      ? []
      : [`${params.place}: keys ${keysText}, the fixture has ${fixtureKeysText}`],
  );

  if (keyMismatches.length > 0) {
    return keyMismatches;
  }

  return Object.entries(params.record).flatMap(([key, fieldValue]) =>
    listShapeMismatches({
      value: fieldValue,
      fixtureValues: fixtureRecords.map((fixtureRecord) => fixtureRecord[key]),
      place: `${params.place}.${key}`,
    }),
  );
}

/** Skips on Windows a test that needs POSIX permissions. */
const testOnPosix = test.skipIf(process.platform === 'win32');

describe.skipIf(AWAITS_WIN32_PLATFORM)('runBridge', () => {
  test('scans and answers with the view of the scan, numbered top to bottom', async () => {
    const { end, events } = await runBridgeWithLines({ lines: [SCAN_LINE] });
    const answers = findAnswers({ events: events });

    expect(end).toBe('inputEnded');
    expect(events.some((event) => event.kind === 'progress')).toBe(true);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      kind: 'scanned',
      summary: {
        titleText: 'Found 3 items, 9.0 MiB in total',
        lines: ['4.0 MiB safe to free', '3.0 MiB to check before deleting'],
      },
      sections: [
        {
          titleText: 'Caches',
          sizeText: '9.0 MiB',
          isInitiallyExpanded: true,
          items: [{ number: 1, title: 'Tool cache', riskText: 'safe', sizeText: '4.0 MiB' }],
          checkGroup: {
            titleText: 'Check before deleting',
            items: [
              { number: 2, title: 'App cache', riskText: 'review', sizeText: '3.0 MiB' },
              { number: 3, title: 'Kept store', riskText: 'never', sizeText: '2.0 MiB' },
            ],
          },
        },
      ],
      explore: {
        items: [],
        adviceGroup: { items: [{ title: 'Tool store', sizeText: '5.0 MiB' }] },
      },
      safeNumbers: [1],
      skipped: { titleText: 'Skipped 1 item', lines: ['too small to matter: 1'] },
      notices: [],
    });
  });

  test('answers status from its probe, with the home the bridge started in', async () => {
    const answers = new Map<FullDiskAccess, BridgeEvent[]>();

    for (const fullDiskAccess of ['granted', 'denied', 'unknown'] as const) {
      const { events, probedHomeDirs } = await runBridgeWithLines({
        lines: [STATUS_LINE],
        fullDiskAccess: fullDiskAccess,
      });

      expect(probedHomeDirs).toEqual([environment.homeDir]);
      answers.set(fullDiskAccess, events);
    }

    expect(answers.get('granted')).toEqual([
      { kind: 'status', fullDiskAccess: 'granted', notices: [] },
    ]);
    expect(answers.get('unknown')).toEqual([
      { kind: 'status', fullDiskAccess: 'unknown', notices: [] },
    ]);
    expect(answers.get('denied')).toEqual([
      {
        kind: 'status',
        fullDiskAccess: 'denied',
        notices: [
          expect.objectContaining({
            titleText: 'Full Disk Access is off',
            settingsLink: FULL_DISK_ACCESS_SETTINGS_LINK,
          }),
        ],
      },
    ]);
  });

  test('a status between the plan and its confirmation keeps the plan to delete', async () => {
    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [
        SCAN_LINE,
        buildPlanLine({ numbers: [2] }),
        STATUS_LINE,
        buildDeleteLine({ planId: 1, confirmation: 'DELETE' }),
      ],
      fullDiskAccess: 'denied',
    });
    const after = await listFixturePaths();

    expect(findAnswers({ events: events }).map((answer) => answer.kind)).toEqual([
      'scanned',
      'planned',
      'status',
      'deleted',
    ]);
    expect(before.filter((path) => !after.includes(path))).toEqual([
      'home/Library/Caches/AppCache',
      'home/Library/Caches/AppCache/blob.bin',
    ]);
  });

  test('a status before a scan leaves the bridge waiting for one', async () => {
    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [STATUS_LINE, buildPlanLine({ numbers: [1] })],
    });

    expect(events).toEqual([
      { kind: 'status', fullDiskAccess: 'unknown', notices: [] },
      { kind: 'failed', message: 'Scan first.', effect: 'scanDropped' },
    ]);
    expect(await listFixturePaths()).toEqual(before);
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
    expect(answers[3]).toMatchObject({ effect: 'scanDropped' });
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
      { kind: 'failed', message: 'No item has the number 99.', effect: 'scanKept' },
      {
        kind: 'failed',
        message: 'No deletion waits for its confirmation; review it again.',
        effect: 'scanKept',
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
      effect: 'scanKept',
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
          effect: 'scanKept',
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
    expect(answers[2]).toMatchObject({ kind: 'failed', effect: 'scanKept' });
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
      effect: 'scanDropped',
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
      effect: 'scanKept',
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

    expect(answers[2]).toMatchObject({ kind: 'failed', effect: 'scanKept' });
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
    expect(events[0]).toMatchObject({ kind: 'failed', effect: 'bridgeStopping' });
    expect(await listFixturePaths()).toEqual(before);
  });

  test('answers checkUpdate with the notice of a newer release, from the home it started in', async () => {
    const { events, fetchCount, preferenceHomeDirs } = await runBridgeWithLines({
      lines: [CHECK_UPDATE_LINE],
    });

    expect(fetchCount).toBe(1);
    expect(preferenceHomeDirs).toEqual([environment.homeDir]);
    expect(events).toEqual([
      {
        kind: 'updateChecked',
        isUpdateCheckEnabled: true,
        notice: expect.objectContaining({ titleText: 'Version 1.3.0 is available' }),
      },
    ]);
  });

  test('answers checkUpdate without a notice when current, failed, off, or unversioned', async () => {
    const current = await runBridgeWithLines({
      lines: [CHECK_UPDATE_LINE],
      latestRelease: { kind: 'succeeded', value: RELEASE_1_2_0 },
    });
    const failed = await runBridgeWithLines({
      lines: [CHECK_UPDATE_LINE],
      latestRelease: { kind: 'failed', failure: { reason: 'timedOut' } },
    });
    const off = await runBridgeWithLines({
      lines: [CHECK_UPDATE_LINE],
      isUpdateCheckEnabled: false,
    });
    const unversioned = await runBridgeWithLines({
      lines: [CHECK_UPDATE_LINE],
      releaseVersion: null,
    });

    expect(current.events).toEqual([
      { kind: 'updateChecked', isUpdateCheckEnabled: true, notice: null },
    ]);
    expect(failed.events).toEqual(current.events);
    expect(unversioned.events).toEqual(current.events);
    expect(off.events).toEqual([
      { kind: 'updateChecked', isUpdateCheckEnabled: false, notice: null },
    ]);
    expect([current, failed, off, unversioned].map((run) => run.fetchCount)).toEqual([1, 1, 0, 0]);
  });

  test('answers checkUpdate with the stored switch for a development build', async () => {
    const { events, fetchCount } = await runBridgeWithLines({
      lines: [CHECK_UPDATE_LINE],
      releaseVersion: null,
      isUpdateCheckEnabled: false,
    });

    expect(events).toEqual([{ kind: 'updateChecked', isUpdateCheckEnabled: false, notice: null }]);
    expect(fetchCount).toBe(0);
  });

  test('saves the switch without fetching and answers with the saved value', async () => {
    const { events, fetchCount, preferenceHomeDirs, savedValues } = await runBridgeWithLines({
      lines: [
        buildSetUpdateCheckLine({ isEnabled: false }),
        buildSetUpdateCheckLine({ isEnabled: true }),
      ],
    });

    expect(events).toEqual([
      { kind: 'updateCheckSet', isUpdateCheckEnabled: false },
      { kind: 'updateCheckSet', isUpdateCheckEnabled: true },
    ]);
    expect(savedValues).toEqual([false, true]);
    expect(preferenceHomeDirs).toEqual([environment.homeDir, environment.homeDir]);
    expect(fetchCount).toBe(0);
  });

  test('a switch that cannot be saved fails and keeps the held plan', async () => {
    const before = await listFixturePaths();
    const { events } = await runBridgeWithLines({
      lines: [
        SCAN_LINE,
        buildPlanLine({ numbers: [2] }),
        buildSetUpdateCheckLine({ isEnabled: false }),
        CHECK_UPDATE_LINE,
        buildDeleteLine({ planId: 1, confirmation: 'DELETE' }),
      ],
      saveResult: { kind: 'failed', failure: { reason: 'writeFailed', code: 'EACCES' } },
    });
    const after = await listFixturePaths();

    expect(findAnswers({ events: events }).slice(1)).toEqual([
      expect.objectContaining({ kind: 'planned', planId: 1 }),
      {
        kind: 'failed',
        message:
          'Cannot write the setting file in the support folder of the app (EACCES), so the setting stays as it was.',
        effect: 'scanKept',
      },
      expect.objectContaining({ kind: 'updateChecked' }),
      expect.objectContaining({ kind: 'deleted' }),
    ]);
    expect(before.filter((path) => !after.includes(path))).toEqual([
      'home/Library/Caches/AppCache',
      'home/Library/Caches/AppCache/blob.bin',
    ]);
  });

  test('a failed save before any scan tells the app the bridge still waits for one', async () => {
    const { events } = await runBridgeWithLines({
      lines: [buildSetUpdateCheckLine({ isEnabled: true }), buildPlanLine({ numbers: [1] })],
      saveResult: { kind: 'failed', failure: { reason: 'directoryUnavailable', code: 'ENOTDIR' } },
    });

    expect(events.map((event) => event.kind)).toEqual(['failed', 'failed']);
    expect(events[0]).toMatchObject({ effect: 'scanDropped' });
  });

  testOnPosix('every event matches the protocol fixture the app is tested with', async () => {
    const containersPath = join(fixtureRoot.homeDir, 'Library/Containers');

    // A place the scan cannot read, so the scan answers with a notice.
    await createFixtureDirectory({ path: containersPath });
    await chmod(containersPath, 0o000);

    const { events } = await runBridgeWithLines({
      lines: [
        STATUS_LINE,
        SCAN_LINE,
        buildPlanLine({ numbers: [3] }),
        buildPlanLine({ numbers: [1] }),
        buildDeleteLine({ planId: 1, confirmation: 'no' }),
        buildPlanLine({ numbers: [99] }),
        buildPlanLine({ numbers: [1] }),
        buildDeleteLine({ planId: 2, confirmation: 'DELETE' }),
        CHECK_UPDATE_LINE,
        buildSetUpdateCheckLine({ isEnabled: false }),
      ],
      fullDiskAccess: 'denied',
    });

    expect(findAnswers({ events: events })[1]).toMatchObject({
      kind: 'scanned',
      notices: [{ titleText: 'Could not read 1 place', settingsLink: null }],
    });
    await expectEventsMatchProtocolFixture({ events: events });
  });

  test('the protocol check finds a missing key, another type, and a null the fixture never shows', () => {
    const fixtureValues = [
      { kind: 'status', notices: [{ titleText: 'A', settingsLink: null }] },
      { kind: 'status', notices: [{ titleText: 'B', settingsLink: { url: 'x' } }] },
    ];

    expect(
      listShapeMismatches({
        value: {
          kind: 'status',
          notices: [{ titleText: 'C', settingsLink: null }, { titleText: 1 }],
        },
        fixtureValues: fixtureValues,
        place: 'status',
      }),
    ).toEqual(['status.notices[1]: keys titleText, the fixture has settingsLink, titleText']);
    expect(
      listShapeMismatches({
        value: { kind: 'status', notices: [{ titleText: 1, settingsLink: { url: 2 } }] },
        fixtureValues: fixtureValues,
        place: 'status',
      }),
    ).toEqual([
      'status.notices[0].titleText: a number, unlike the fixture',
      'status.notices[0].settingsLink.url: a number, unlike the fixture',
    ]);
    expect(
      listShapeMismatches({
        value: { kind: null, notices: [] },
        fixtureValues: fixtureValues,
        place: 'status',
      }),
    ).toEqual(['status.kind: null, which the fixture never shows here']);
  });
});
