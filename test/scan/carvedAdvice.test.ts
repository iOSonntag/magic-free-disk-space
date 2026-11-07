import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { CATALOG_ENTRIES } from '../../src/platform/darwin/catalogEntries.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { buildCarvedPaths, decideCatalogCandidate } from '../../src/scan/decideCatalogCandidate.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import type { TargetsMeasurement } from '../../src/scan/loadMeasuredTargetsPhase.js';
import {
  buildFoundTargets,
  loadMeasuredTargetsPhase,
} from '../../src/scan/loadMeasuredTargetsPhase.js';
import { createConcurrencyLimit } from '../../src/system/createConcurrencyLimit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  loadTestEnvironment,
  withFixtureRoot,
} from '../support/fixtureRoot.js';
import { runTestScan } from '../support/scanRunFixtures.js';

// Both are large enough to offer, and the snippet is smaller than the previews.
const PREVIEWS_FILE_BYTES = 4 * SCAN_LIMITS.minOfferedBytes;

const SNIPPET_FILE_BYTES = SCAN_LIMITS.minOfferedBytes;

const MODIFIED_MS = Date.UTC(2026, 0, 1);

type UserDataFixture = { environment: Environment; userDataPath: string; previewsPath: string };

/** Builds a temporary Xcode `UserData` tree, hands it to `run`, and removes it afterwards. */
async function withUserData(params: {
  run: (fixture: UserDataFixture) => Promise<void>;
}): Promise<void> {
  await withFixtureRoot({
    run: async (fixtureRoot) => {
      const userDataPath = join(fixtureRoot.homeDir, 'Library', 'Developer', 'Xcode', 'UserData');

      await params.run({
        environment: await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: MODIFIED_MS }),
        userDataPath: userDataPath,
        previewsPath: join(userDataPath, 'Previews'),
      });
    },
  });
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
 * Measures the user data entry at its path as the scan's target phase does, carved or whole, and
 * returns the measurement its decide got.
 */
async function loadUserDataMeasurement(params: {
  fixture: UserDataFixture;
  isCarved: boolean;
}): Promise<TargetsMeasurement | undefined> {
  const entry = findEntry('xcode-user-data');
  const pathRules = params.fixture.environment.pathRules;
  const path = params.fixture.userDataPath;
  const carvedPaths = params.isCarved
    ? buildCarvedPaths({ pathRules: pathRules, entry: entry, path: path })
    : [];
  const measurements: TargetsMeasurement[] = [];

  await loadMeasuredTargetsPhase({
    found: buildFoundTargets([path]),
    carve: carvedPaths.length === 0 ? null : { pathRules: pathRules, carvedPaths: carvedPaths },
    measureTimeoutMs: 10_000,
    runItemMeasurement: createConcurrencyLimit({ maxConcurrent: 1 }),
    entryReads: darwinPlatform.system.entryReads,
    privacyDenialCode: darwinPlatform.system.privacyDenialCode,
    decide: async (measurement) => {
      measurements.push(measurement);

      return decideCatalogCandidate({
        entry: entry,
        path: path,
        measurement: measurement,
        owner: entry.owner,
        ownerBundlePaths: [],
        ownerState: 'stopped',
        ownerAppName: 'Xcode',
        activity: null,
        minOfferedBytes: 1,
        carvedPaths: carvedPaths,
      });
    },
  });

  return measurements[0];
}

describeAwaitingWin32Platform('the carve of the Xcode previews out of the user data advice', () => {
  test('offers the previews, and sizes the advice without their bytes', async () => {
    await withUserData({
      run: async (fixture) => {
        await createUserData(fixture);

        const report = await runTestScan({
          environment: fixture.environment,
          catalogEntries: [findEntry('xcode-previews'), findEntry('xcode-user-data')],
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

        const carved = await loadUserDataMeasurement({ fixture: fixture, isCarved: true });
        const whole = await loadUserDataMeasurement({ fixture: fixture, isCarved: false });

        expect(carved?.targets.map((target) => [target.path, target.identity.kind])).toEqual([
          [fixture.userDataPath, 'directory'],
        ]);
        expect(whole?.allocatedBytes).toBeGreaterThanOrEqual(
          PREVIEWS_FILE_BYTES + SNIPPET_FILE_BYTES,
        );
        expect(carved?.allocatedBytes).toBeLessThan(PREVIEWS_FILE_BYTES);
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

        const report = await runTestScan({
          environment: fixture.environment,
          catalogEntries: [findEntry('xcode-user-data')],
        });

        expect(report.candidates).toEqual([]);
        expect(report.advice).toEqual([]);
        expect(report.skipped).toEqual([]);
      },
    });
  });
});
