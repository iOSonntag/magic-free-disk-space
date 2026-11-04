import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { deleteCandidates } from '../../src/delete/deleteCandidates.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import { createTestJournal } from '../support/deletionJournalFixtures.js';
import { createFixtureFile, isPresent } from '../support/fixtureRoot.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { withFixtureHome } from '../support/probeRunFixtures.js';
import { getCatalogEntry, runTestScan } from '../support/scanRunFixtures.js';

const describeOnDarwin = describe.skipIf(process.platform !== 'darwin');

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

describeOnDarwin('the data of a system app', () => {
  test('stays while its app runs, though no app folder lists the app', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        await createPreview({ environment: home.environment });

        const report = await runTestScan({
          environment: home.environment,
          catalogEntries: [getCatalogEntry('messages-attachment-previews')],
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

  test('is offered with the name and the bundle of its app, so a delete keeps it once the app started', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const previewPath = await createPreview({ environment: home.environment });
        const report = await runTestScan({
          environment: home.environment,
          catalogEntries: [getCatalogEntry('messages-attachment-previews')],
        });

        expect(report.candidates).toMatchObject([
          {
            path: getPreviewsPath({ environment: home.environment }),
            appName: 'Messages',
            removal: {
              kind: 'deletePaths',
              owner: { kind: 'bundles', bundlePaths: [MESSAGES_BUNDLE_PATH] },
            },
          },
        ]);

        const run = await deleteCandidates({
          candidates: report.candidates,
          journal: await createTestJournal({
            logPath: home.environment.deletionLogPath,
            nowMs: NOW_MS,
          }),
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
