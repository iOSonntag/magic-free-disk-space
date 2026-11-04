import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import type { HomeFixtureFile } from '../platform/darwin/catalogScan.js';
import { withScannedCatalogHome } from '../platform/darwin/catalogScan.js';

const describeOnDarwin = describe.skipIf(process.platform !== 'darwin');

/** The files below the fixture home: the deletion log, an app's log, and a preview. */
const HOME_FILES: HomeFixtureFile[] = [
  'Library/Logs/magic-free-disk-space/deletions.jsonl',
  'Library/Logs/com.example.app/app.log',
  'Library/Messages/Caches/Previews/Attachments/ab/preview.jpg',
].map((path) => ({ path: path, sizeBytes: SCAN_LIMITS.minOfferedBytes }));

describeOnDarwin('the scan of the paths the removal never touches', () => {
  test('the app logs neither offer nor advise the deletion log, and skip it', async () => {
    await withScannedCatalogHome({
      entryIds: ['user-logs'],
      files: HOME_FILES,
      run: ({ homeDir, report }) => {
        const logsPath = join(homeDir, 'Library/Logs');
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
    await withScannedCatalogHome({
      entryIds: ['messages-attachment-previews'],
      files: HOME_FILES,
      run: ({ homeDir, report }) => {
        expect(report.candidates.map((candidate) => candidate.path)).toEqual([
          join(homeDir, 'Library/Messages/Caches/Previews/Attachments'),
        ]);
        expect(report.skipped).toEqual([]);
      },
    });
  });
});
