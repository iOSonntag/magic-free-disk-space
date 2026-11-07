import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { Advice } from '../../src/scan/candidate.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { createFixtureFile, loadTestEnvironment, withFixtureRoot } from '../support/fixtureRoot.js';
import { getCatalogEntry, runTestScan } from '../support/scanRunFixtures.js';

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
  await createFixtureFile({
    path: join(fixture.previewsPath, 'Simulator Devices', 'build', 'App.app.bin'),
    sizeBytes: PREVIEWS_FILE_BYTES,
    modifiedMs: MODIFIED_MS,
  });
  await createFixtureFile({
    path: join(fixture.userDataPath, 'CodeSnippets', 'snippet.codesnippet'),
    sizeBytes: SNIPPET_FILE_BYTES,
    modifiedMs: MODIFIED_MS,
  });
}

/** The user data entry with nothing carved out, so its advice holds the previews as well. */
function buildUncarvedUserDataEntry(): CatalogEntry {
  const entry = getCatalogEntry('xcode-user-data');

  if (entry.removal.kind !== 'advice') {
    throw new Error('The user data entry advises no longer.');
  }

  return { ...entry, removal: { ...entry.removal, carvedPaths: [] } };
}

/** The one advice of a scan with only `entry`; throws when the scan gives none or more. */
async function loadOnlyAdvice(params: {
  fixture: UserDataFixture;
  entry: CatalogEntry;
}): Promise<Advice> {
  const report = await runTestScan({
    environment: params.fixture.environment,
    catalogEntries: [params.entry],
  });
  const [advice, ...otherAdvice] = report.advice;

  if (advice === undefined || otherAdvice.length > 0) {
    throw new Error(`The scan gave ${report.advice.length} advice, not one.`);
  }

  return advice;
}

describeAwaitingWin32Platform('the carve of the Xcode previews out of the user data advice', () => {
  test('offers the previews, and sizes the advice without their bytes', async () => {
    await withUserData({
      run: async (fixture) => {
        await createUserData(fixture);

        const report = await runTestScan({
          environment: fixture.environment,
          catalogEntries: [getCatalogEntry('xcode-previews'), getCatalogEntry('xcode-user-data')],
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

  test('advises the user data folder itself, whose whole tally holds the previews', async () => {
    await withUserData({
      run: async (fixture) => {
        await createUserData(fixture);

        const carved = await loadOnlyAdvice({
          fixture: fixture,
          entry: getCatalogEntry('xcode-user-data'),
        });
        const whole = await loadOnlyAdvice({
          fixture: fixture,
          entry: buildUncarvedUserDataEntry(),
        });

        expect(carved.path).toBe(fixture.userDataPath);
        expect(whole.path).toBe(fixture.userDataPath);
        expect(whole.allocatedBytes).toBeGreaterThanOrEqual(
          PREVIEWS_FILE_BYTES + SNIPPET_FILE_BYTES,
        );
        expect(carved.allocatedBytes).toBeLessThan(PREVIEWS_FILE_BYTES);
      },
    });
  });

  test('gives no advice for a user data folder that holds only the previews', async () => {
    await withUserData({
      run: async (fixture) => {
        await createFixtureFile({
          path: join(fixture.previewsPath, 'build', 'App.app.bin'),
          sizeBytes: PREVIEWS_FILE_BYTES,
          modifiedMs: MODIFIED_MS,
        });

        const report = await runTestScan({
          environment: fixture.environment,
          catalogEntries: [getCatalogEntry('xcode-user-data')],
        });

        expect(report.candidates).toEqual([]);
        expect(report.advice).toEqual([]);
        expect(report.skipped).toEqual([]);
      },
    });
  });
});
