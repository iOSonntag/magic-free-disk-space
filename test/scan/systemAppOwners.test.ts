import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { deleteCandidates } from '../../src/delete/deleteCandidates.js';
import type { DeletionJournal } from '../../src/delete/deletionJournal.js';
import { createDeletionJournal } from '../../src/delete/deletionJournal.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import { runScan } from '../../src/scan/runScan.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { TOOL_INSTALL_LOCATIONS_NONE } from '../support/candidateFixtures.js';
import { createFixtureFile, isPresent } from '../support/fixtureRoot.js';
import { buildTestPlatform } from '../support/platformFixtures.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { withFixtureHome } from '../support/probeRunFixtures.js';
import { getCatalogEntry } from '../support/scanRunFixtures.js';

/** The time of every scan and delete, half a year after the previews were written. */
const NOW_MS = Date.UTC(2026, 6, 1);

/** The bundle of Messages, which macOS keeps outside every app folder. */
const MESSAGES_BUNDLE_PATH = '/System/Applications/Messages.app';

/** The command of Messages as the process list shows it while the app runs. */
const MESSAGES_COMMAND = `${MESSAGES_BUNDLE_PATH}/Contents/MacOS/Messages`;

/** The previews folder of the catalog entry `messages-attachment-previews` in the fixture home. */
function getPreviewsPath(params: { environment: Environment }): string {
  return join(params.environment.homeDir, 'Library/Messages/Caches/Previews/Attachments');
}

/** Writes a preview into the previews folder, large enough for the scan to offer it. */
async function createPreview(params: { environment: Environment }): Promise<string> {
  const path = join(getPreviewsPath({ environment: params.environment }), 'preview.jpg');

  await createFixtureFile({
    path: path,
    sizeBytes: SCAN_LIMITS.minOfferedBytes * 2,
    modifiedMs: Date.UTC(2026, 0, 1),
  });

  return path;
}

/**
 * Scans the fixture home with the Messages previews entry alone while `processCommands` run; it
 * builds the run as `runTestScan` does, which keeps no process running.
 */
function scanPreviews(params: {
  environment: Environment;
  processCommands: string[];
}): Promise<ScanReport> {
  const platform = buildTestPlatform({
    catalogEntries: [getCatalogEntry('messages-attachment-previews')],
    toolInstallLocations: TOOL_INSTALL_LOCATIONS_NONE,
  });

  return runScan({
    environment: params.environment,
    catalog: platform.catalog,
    tools: platform.tools,
    scan: {
      ...platform.scan,
      loadActiveXcodeBundlePath: async () => ({ kind: 'succeeded', value: null }),
    },
    system: {
      ...platform.system,
      loadRunningProcesses: async () => ({ kind: 'succeeded', value: params.processCommands }),
      loadSystemVersion: async () => null,
    },
    explore: platform.explore,
    options: {
      staleDays: SCAN_LIMITS.defaultStaleDays,
      unusedDays: SCAN_LIMITS.defaultUnusedDays,
    },
    onProgress: () => undefined,
  });
}

/** A journal of the deletions in the fixture home's own log. */
async function createTestJournal(params: { environment: Environment }): Promise<DeletionJournal> {
  const journal = await createDeletionJournal({
    logPath: params.environment.deletionLogPath,
    nowMs: NOW_MS,
  });

  if (journal.kind === 'failed') {
    throw new Error(`Journal failed: ${journal.failure.reason}`);
  }

  return journal.value;
}

describeAwaitingWin32Platform('the data of a system app', () => {
  test('stays while its app runs, though no app folder lists the app', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        await createPreview({ environment: home.environment });

        const report = await scanPreviews({
          environment: home.environment,
          processCommands: ['/sbin/launchd', MESSAGES_COMMAND],
        });

        expect(report.candidates).toEqual([]);
        expect(report.skipped).toContainEqual({
          path: getPreviewsPath({ environment: home.environment }),
          reason: 'ownerRunning',
        });
      },
    });
  });

  test('is offered with the bundle of its app, so a delete keeps it once the app started', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const previewPath = await createPreview({ environment: home.environment });
        const report = await scanPreviews({ environment: home.environment, processCommands: [] });

        expect(report.candidates).toMatchObject([
          {
            path: getPreviewsPath({ environment: home.environment }),
            removal: { kind: 'deletePaths', ownerBundlePaths: [MESSAGES_BUNDLE_PATH] },
          },
        ]);

        const run = await deleteCandidates({
          candidates: report.candidates,
          journal: await createTestJournal({ environment: home.environment }),
          environment: home.environment,
          delete: darwinPlatform.delete,
          probePlatform: buildTestProbePlatform(),
          entryReads: darwinPlatform.system.entryReads,
          loadProcessCommands: async () => [MESSAGES_COMMAND],
          clock: () => NOW_MS,
        });

        expect(run.outcomes.map((outcome) => outcome.outcome)).toEqual(['ownerRunning']);
        expect(await isPresent(previewPath)).toBe(true);
      },
    });
  });

  test('of Mail is held back by the bundle the Mail downloads probe watches', () => {
    const mailApps = darwinPlatform.scan.systemApps.filter(
      (app) => app.bundleId === 'com.apple.mail',
    );

    expect(darwinPlatform.explore.mailBundlePaths).toEqual(mailApps.map((app) => app.bundlePath));
    expect(mailApps).toHaveLength(1);
  });
});
