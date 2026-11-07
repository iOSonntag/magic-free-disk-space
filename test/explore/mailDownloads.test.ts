import { expect, test } from 'bun:test';
import { utimes } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadMailDownloadFindings } from '../../src/explore/mailDownloads/loadMailDownloadFindings.js';
import { recheckMailDownloadsUnit } from '../../src/explore/mailDownloads/recheckMailDownloadsUnit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  updateModifiedMs,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import type { FixtureHome } from '../support/probeRunFixtures.js';
import {
  buildTestProbeRun,
  DAY_MS,
  findUnitOfKind,
  getProbeFindings,
  withFixtureHome,
} from '../support/probeRunFixtures.js';

// Whole seconds, which the fixture's times keep exactly.
const NOW_MS = Math.floor(Date.now() / 1000) * 1000;
const STALE_CUTOFF_MS = NOW_MS - 30 * DAY_MS;
const OLD_MS = NOW_MS - 90 * DAY_MS;
const FILE_SIZE_BYTES = 4096;
const MAIL_COMMAND = '/System/Applications/Mail.app/Contents/MacOS/Mail';

function getMailDownloadsPath(home: FixtureHome): string {
  const rootNames = buildTestProbePlatform().explore.mailDownloadsRoot;

  if (rootNames === null) {
    throw new Error('The platform has no Mail Downloads folder.');
  }

  return join(home.fixtureRoot.homeDir, ...rootNames);
}

/**
 * A file Mail saved long ago, with its missing folders: an mtime before the birth time moves the
 * birth time back with it on macOS, so the file reads as saved then and never changed.
 */
async function createMailFile(params: { path: string; accessedMs?: number }): Promise<void> {
  await createFixtureDirectory({ path: dirname(params.path) });
  await createFixtureFile({
    path: params.path,
    sizeBytes: FILE_SIZE_BYTES,
    modifiedMs: OLD_MS,
    accessedMs: params.accessedMs ?? OLD_MS,
  });
}

describeAwaitingWin32Platform('the Mail Downloads probe', () => {
  test('finds the attachment copies saved and read before the cutoff and never changed', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const folder = getMailDownloadsPath(home);
        const editedPath = join(folder, 'A1', 'edited.docx');

        await createMailFile({ path: join(folder, 'A1', 'saved.pdf') });
        await createMailFile({ path: join(folder, 'B2', 'Deep', 'scan.jpg') });
        // Edited after Mail saved it: the person's own work now.
        await createMailFile({ path: editedPath });
        await updateModifiedMs({ path: editedPath, modifiedMs: OLD_MS + DAY_MS });
        await createMailFile({ path: join(folder, 'B2', 'opened.pdf'), accessedMs: NOW_MS });
        await createMailFile({ path: join(folder, 'B2', '.DS_Store') });

        expect(
          getProbeFindings(
            await loadMailDownloadFindings(
              buildTestProbeRun({ environment: home.environment, cutoffMs: STALE_CUTOFF_MS }),
            ),
          ),
        ).toEqual({
          findings: [
            {
              unit: {
                kind: 'mailDownloads',
                folderPath: buildTestAbsolutePath({ text: folder }),
                cutoffMs: STALE_CUTOFF_MS,
                foundFiles: [
                  {
                    path: buildTestAbsolutePath({ text: join(folder, 'A1', 'saved.pdf') }),
                    modifiedMs: OLD_MS,
                  },
                  {
                    path: buildTestAbsolutePath({ text: join(folder, 'B2', 'Deep', 'scan.jpg') }),
                    modifiedMs: OLD_MS,
                  },
                ],
              },
              title: 'Attachments Mail opened',
              explanation: expect.any(String),
              regeneration: expect.any(String),
              risk: 'review',
              evidenceLines: [expect.stringContaining('2 attachments')],
              displayPath: buildTestAbsolutePath({ text: folder }),
              activity: 'idle',
            },
          ],
          isComplete: true,
        });
      },
    });
  });

  test('tells the attachments busy while Mail runs', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        await createMailFile({ path: join(getMailDownloadsPath(home), 'A1', 'saved.pdf') });

        const probed = getProbeFindings(
          await loadMailDownloadFindings(
            buildTestProbeRun({
              environment: home.environment,
              processCommands: [MAIL_COMMAND],
              cutoffMs: STALE_CUTOFF_MS,
            }),
          ),
        );

        expect(probed.findings.map((finding) => finding.activity)).toEqual(['busy']);
      },
    });
  });

  test('says the place is missing without the folder', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        expect(
          await loadMailDownloadFindings(
            buildTestProbeRun({ environment: home.environment, cutoffMs: STALE_CUTOFF_MS }),
          ),
        ).toEqual({ kind: 'failed', failure: { reason: 'placeMissing' } });
      },
    });
  });
});

describeAwaitingWin32Platform('recheckMailDownloadsUnit', () => {
  test('finds a unit unchanged, then changed once a file was opened or changed', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const filePath = join(getMailDownloadsPath(home), 'A1', 'saved.pdf');

        await createMailFile({ path: filePath });

        const run = buildTestProbeRun({ environment: home.environment, cutoffMs: STALE_CUTOFF_MS });
        const unit = findUnitOfKind({
          findings: getProbeFindings(await loadMailDownloadFindings(run)),
          kind: 'mailDownloads',
        });
        const recheck = (processCommands: string[] | null) =>
          recheckMailDownloadsUnit({
            unit: unit,
            environment: run.environment,
            platform: run.platform,
            processCommands: processCommands,
          });

        expect(await recheck([])).toEqual({ kind: 'unchanged' });
        expect(await recheck([MAIL_COMMAND])).toEqual({ kind: 'busy' });

        // Opened: read now, its change kept.
        await utimes(filePath, NOW_MS / 1000, OLD_MS / 1000);

        expect(await recheck([])).toEqual({ kind: 'changed' });

        await updateModifiedMs({ path: filePath, modifiedMs: OLD_MS + DAY_MS });

        expect(await recheck([])).toEqual({ kind: 'changed' });
      },
    });
  });
});
