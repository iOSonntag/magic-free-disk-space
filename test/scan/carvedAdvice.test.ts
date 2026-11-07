import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import { CATALOG_ENTRIES } from '../../src/platform/darwin/catalogEntries.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import { buildCarvedPaths, decideCatalogCandidate } from '../../src/scan/decideCatalogCandidate.js';
import type { TargetsMeasurement } from '../../src/scan/loadMeasuredTargetsPhase.js';
import {
  buildFoundTargets,
  loadMeasuredTargetsPhase,
} from '../../src/scan/loadMeasuredTargetsPhase.js';
import { buildScanReportOfPhases } from '../../src/scan/runScan.js';
import type { ScanPhase } from '../../src/scan/scanPhase.js';
import { createConcurrencyLimit } from '../../src/system/createConcurrencyLimit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

const PREVIEWS_FILE_BYTES = 1_048_576;

const SNIPPET_FILE_BYTES = 8192;

const MODIFIED_MS = Date.UTC(2026, 0, 1);

type UserDataFixture = { userDataPath: string; previewsPath: string };

/** Builds a temporary Xcode `UserData` tree, hands it to `run`, and removes it afterwards. */
async function withUserData(params: {
  run: (fixture: UserDataFixture) => Promise<void>;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    const userDataPath = join(fixtureRoot.homeDir, 'Library', 'Developer', 'Xcode', 'UserData');

    await params.run({ userDataPath: userDataPath, previewsPath: join(userDataPath, 'Previews') });
  } finally {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  }
}

/** A large preview build inside `Previews`, and a snippet beside it. */
async function createUserData(fixture: UserDataFixture): Promise<void> {
  const buildPath = join(fixture.previewsPath, 'Simulator Devices', 'build');
  const snippetsPath = join(fixture.userDataPath, 'CodeSnippets');

  await createFixtureDirectory({ path: buildPath });
  await createFixtureDirectory({ path: snippetsPath });
  await createFixtureFile({
    path: join(buildPath, 'App.app.bin'),
    sizeBytes: PREVIEWS_FILE_BYTES,
    modifiedMs: MODIFIED_MS,
  });
  await createFixtureFile({
    path: join(snippetsPath, 'snippet.codesnippet'),
    sizeBytes: SNIPPET_FILE_BYTES,
    modifiedMs: MODIFIED_MS,
  });
}

function findEntry(id: string): CatalogEntry {
  const entry = CATALOG_ENTRIES.find((candidate) => candidate.id === id);

  if (entry === undefined) {
    throw new Error(`The catalog holds no entry ${id}.`);
  }

  return entry;
}

/**
 * The phase of one catalog entry at `path` as the scan runs it: its carved paths, the measurement
 * less them, and the decision, with the owner stopped. Keeps each measurement its decide got.
 */
function loadEntryPhase(params: {
  entry: CatalogEntry;
  path: string;
  isCarved: boolean;
  measurements: TargetsMeasurement[];
}): Promise<ScanPhase> {
  const carvedPaths = params.isCarved
    ? buildCarvedPaths({ pathRules: DARWIN_PATH_RULES, entry: params.entry, path: params.path })
    : [];

  return loadMeasuredTargetsPhase({
    found: buildFoundTargets([params.path]),
    carve:
      carvedPaths.length === 0 ? null : { pathRules: DARWIN_PATH_RULES, carvedPaths: carvedPaths },
    measureTimeoutMs: 10_000,
    runItemMeasurement: createConcurrencyLimit({ maxConcurrent: 1 }),
    entryReads: darwinPlatform.system.entryReads,
    privacyDenialCode: darwinPlatform.system.privacyDenialCode,
    decide: async (measurement) => {
      params.measurements.push(measurement);

      return decideCatalogCandidate({
        entry: params.entry,
        path: params.path,
        measurement: measurement,
        owner: params.entry.owner,
        ownerBundlePaths: [],
        ownerState: 'stopped',
        ownerAppName: 'Xcode',
        activity: null,
        minOfferedBytes: 1,
        carvedPaths: carvedPaths,
      });
    },
  });
}

describeAwaitingWin32Platform('the carve of the Xcode previews out of the user data advice', () => {
  test('offers the previews, and sizes the advice without their bytes', async () => {
    await withUserData({
      run: async (fixture) => {
        await createUserData(fixture);

        const measurements: TargetsMeasurement[] = [];
        const previewsPhase = await loadEntryPhase({
          entry: findEntry('xcode-previews'),
          path: fixture.previewsPath,
          isCarved: true,
          measurements: measurements,
        });
        const userDataPhase = await loadEntryPhase({
          entry: findEntry('xcode-user-data'),
          path: fixture.userDataPath,
          isCarved: true,
          measurements: measurements,
        });
        const report = buildScanReportOfPhases({
          pathRules: DARWIN_PATH_RULES,
          reservedEntryPaths: [],
          phases: [previewsPhase, userDataPhase],
          incompleteExploreAdvice: { decisions: [], issues: [] },
        });
        const [previews] = report.candidates;
        const [userData] = report.advice;

        expect(report.candidates).toHaveLength(1);
        expect(previews?.origin).toEqual({ kind: 'catalog', entryId: 'xcode-previews' });
        expect(previews?.path).toBe(fixture.previewsPath);
        expect(previews?.allocatedBytes).toBeGreaterThanOrEqual(PREVIEWS_FILE_BYTES);
        expect(report.advice).toHaveLength(1);
        expect(userData?.origin).toEqual({ kind: 'catalog', entryId: 'xcode-user-data' });
        expect(userData?.carvedPaths).toEqual([fixture.previewsPath]);
        expect(userData?.allocatedBytes).toBeGreaterThanOrEqual(SNIPPET_FILE_BYTES);
        expect(userData?.allocatedBytes).toBeLessThan(PREVIEWS_FILE_BYTES);
        expect(report.skipped).toEqual([]);
      },
    });
  });

  test('keeps the identity of the user data folder itself, whose whole tally holds the previews', async () => {
    await withUserData({
      run: async (fixture) => {
        await createUserData(fixture);

        const carved: TargetsMeasurement[] = [];
        const whole: TargetsMeasurement[] = [];

        await loadEntryPhase({
          entry: findEntry('xcode-user-data'),
          path: fixture.userDataPath,
          isCarved: true,
          measurements: carved,
        });
        await loadEntryPhase({
          entry: findEntry('xcode-user-data'),
          path: fixture.userDataPath,
          isCarved: false,
          measurements: whole,
        });

        expect(carved[0]?.targets.map((target) => [target.path, target.identity.kind])).toEqual([
          [fixture.userDataPath, 'directory'],
        ]);
        expect(whole[0]?.allocatedBytes).toBeGreaterThanOrEqual(
          PREVIEWS_FILE_BYTES + SNIPPET_FILE_BYTES,
        );
        expect(carved[0]?.allocatedBytes).toBeLessThan(PREVIEWS_FILE_BYTES);
      },
    });
  });

  test('gives no advice for a user data folder that holds only the previews', async () => {
    await withUserData({
      run: async (fixture) => {
        await createFixtureDirectory({ path: join(fixture.previewsPath, 'build') });
        await createFixtureFile({
          path: join(fixture.previewsPath, 'build', 'App.app.bin'),
          sizeBytes: PREVIEWS_FILE_BYTES,
          modifiedMs: MODIFIED_MS,
        });

        const phase = await loadEntryPhase({
          entry: findEntry('xcode-user-data'),
          path: fixture.userDataPath,
          isCarved: true,
          measurements: [],
        });

        expect(phase).toEqual({ decisions: [], issues: [] });
      },
    });
  });
});
