import { expect, test } from 'bun:test';
import { utimes } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CATALOG_ENTRIES } from '../../src/platform/darwin/catalogEntries.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  loadTestEnvironment,
  withFixtureRoot,
} from '../support/fixtureRoot.js';
import { runTestScan } from '../support/scanRunFixtures.js';

const MODIFIED_MS = Date.UTC(2026, 0, 1);

const NOW_MS = Date.UTC(2026, 6, 1);

/** The paths below the fixture home: each made with one old file in it. */
const HOME_FILE_PATHS = [
  'Library/Logs/magic-free-disk-space/deletions.jsonl',
  'Library/Logs/com.example.app/app.log',
  'Library/Messages/Caches/Previews/Attachments/ab/preview.jpg',
];

/** Builds the fixture home, runs the scan with only the given entries, and removes the home. */
async function withScannedHome(params: {
  entryIds: string[];
  run: (scan: { fixtureRoot: FixtureRoot; report: ScanReport }) => void;
}): Promise<void> {
  await withFixtureRoot({
    run: async (fixtureRoot) => {
      for (const path of HOME_FILE_PATHS) {
        await createFixtureDirectory({ path: dirname(join(fixtureRoot.homeDir, path)) });
        await createFixtureFile({
          path: join(fixtureRoot.homeDir, path),
          sizeBytes: SCAN_LIMITS.minOfferedBytes,
          modifiedMs: MODIFIED_MS,
        });
      }

      // Each file just changed the folder that holds it, which an age rule reads as well.
      for (const path of HOME_FILE_PATHS) {
        const folderPath = dirname(join(fixtureRoot.homeDir, path));

        await utimes(folderPath, MODIFIED_MS / 1000, MODIFIED_MS / 1000);
      }

      const report = await runTestScan({
        environment: await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS }),
        catalogEntries: CATALOG_ENTRIES.filter((entry) => params.entryIds.includes(entry.id)),
      });

      params.run({ fixtureRoot: fixtureRoot, report: report });
    },
  });
}

describeAwaitingWin32Platform('the scan of the paths the removal never touches', () => {
  test('the app logs neither offer nor advise the deletion log, and skip it', async () => {
    await withScannedHome({
      entryIds: ['user-logs'],
      run: ({ fixtureRoot, report }) => {
        const logsPath = join(fixtureRoot.homeDir, 'Library/Logs');
        const deletionLogPath = join(logsPath, 'magic-free-disk-space');

        expect(report.candidates.map((candidate) => candidate.path)).toEqual([
          join(logsPath, 'com.example.app'),
        ]);
        expect(report.advice).toEqual([]);
        expect(report.skipped).toEqual([{ path: deletionLogPath, reason: 'protectedPath' }]);
      },
    });
  });

  test('the attachment previews of Messages are still offered', async () => {
    await withScannedHome({
      entryIds: ['messages-attachment-previews'],
      run: ({ fixtureRoot, report }) => {
        expect(report.candidates.map((candidate) => candidate.path)).toEqual([
          join(fixtureRoot.homeDir, 'Library/Messages/Caches/Previews/Attachments'),
        ]);
        expect(report.skipped).toEqual([]);
      },
    });
  });
});
