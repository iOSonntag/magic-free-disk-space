import { describe, expect, test } from 'bun:test';
import { utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveEnvironmentLocation } from '../../src/environment/environmentLocation.js';
import type { PathUnitRecheck } from '../../src/explore/decideComparisonActivity.js';
import { loadMailDownloadFindings } from '../../src/explore/mailDownloads/loadMailDownloadFindings.js';
import { recheckMailDownloadsUnit } from '../../src/explore/mailDownloads/recheckMailDownloadsUnit.js';
import { DAY_MS } from '../../src/scan/limits.js';
import { createFixtureFile, updateModifiedMs } from '../support/fixtureRoot.js';
import { buildTestHostPath } from '../support/parsedValueFixtures.js';
import { HOST_PLATFORM } from '../support/platformFixtures.js';
import type { FixtureHome } from '../support/probeRunFixtures.js';
import {
  buildTestProbeRun,
  getProbeFindings,
  getUnitOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';

// Whole seconds, which the fixture's times keep exactly.
const NOW_MS = Math.floor(Date.now() / 1000) * 1000;
const STALE_CUTOFF_MS = NOW_MS - 30 * DAY_MS;
const OLD_MS = NOW_MS - 90 * DAY_MS;
const FILE_SIZE_BYTES = 4096;
const MAIL_COMMAND = '/System/Applications/Mail.app/Contents/MacOS/Mail';

/** Runs a suite only on a host whose catalog names the folder Mail saves its attachments in. */
const describeWithMailDownloads = describe.skipIf(HOST_PLATFORM.explore.mailDownloadsRoot === null);

function getMailDownloadsPath(home: FixtureHome): string {
  const root = HOST_PLATFORM.explore.mailDownloadsRoot;

  if (root === null) {
    throw new Error('The platform has no Mail Downloads folder.');
  }

  return resolveEnvironmentLocation({ folders: home.environment, location: root });
}

/**
 * A file Mail saved long ago: an mtime before the birth time moves the birth time back with it on
 * macOS, so the file reads as saved then and never changed.
 */
async function createMailFile(params: { path: string; accessedMs?: number }): Promise<void> {
  await createFixtureFile({
    path: params.path,
    sizeBytes: FILE_SIZE_BYTES,
    modifiedMs: OLD_MS,
    accessedMs: params.accessedMs ?? OLD_MS,
  });
}

describeWithMailDownloads('the Mail Downloads probe', () => {
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
              buildTestProbeRun({ environment: home.environment, staleCutoffMs: STALE_CUTOFF_MS }),
            ),
          ),
        ).toEqual({
          findings: [
            {
              unit: {
                kind: 'mailDownloads',
                folderPath: buildTestHostPath({ text: folder }),
                cutoffMs: STALE_CUTOFF_MS,
                foundFiles: [
                  {
                    path: buildTestHostPath({ text: join(folder, 'A1', 'saved.pdf') }),
                    modifiedMs: OLD_MS,
                  },
                  {
                    path: buildTestHostPath({ text: join(folder, 'B2', 'Deep', 'scan.jpg') }),
                    modifiedMs: OLD_MS,
                  },
                ],
              },
              title: 'Attachments Mail opened',
              explanation: expect.any(String),
              regeneration: expect.any(String),
              risk: 'review',
              evidenceLines: [expect.stringContaining('2 attachments')],
              displayPath: buildTestHostPath({ text: folder }),
              activity: 'idle',
            },
          ],
          isComplete: true,
        });
      },
    });
  });

  test('goes by the stale window, not the unused one', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const savedPath = join(getMailDownloadsPath(home), 'A1', 'saved.pdf');

        await createMailFile({ path: savedPath });

        const probed = getProbeFindings(
          await loadMailDownloadFindings(
            buildTestProbeRun({
              environment: home.environment,
              staleCutoffMs: STALE_CUTOFF_MS,
              unusedCutoffMs: NOW_MS - 180 * DAY_MS,
            }),
          ),
        );

        expect(
          getUnitOfKind({ findings: probed, kind: 'mailDownloads' }).foundFiles.map(
            (file) => file.path,
          ),
        ).toEqual([buildTestHostPath({ text: savedPath })]);
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
              runningProcesses: buildRunningCommandLines([MAIL_COMMAND]),
              staleCutoffMs: STALE_CUTOFF_MS,
            }),
          ),
        );

        expect(probed.findings.map((finding) => finding.activity)).toEqual(['busy']);
      },
    });
  });
});

describe('the Mail Downloads probe without its folder', () => {
  test('says the place is missing', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        expect(
          await loadMailDownloadFindings(
            buildTestProbeRun({ environment: home.environment, staleCutoffMs: STALE_CUTOFF_MS }),
          ),
        ).toEqual({ kind: 'failed', failure: { reason: 'placeMissing' } });
      },
    });
  });
});

describeWithMailDownloads('recheckMailDownloadsUnit', () => {
  test('finds a unit unchanged, then changed once a file was opened or changed', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const filePath = join(getMailDownloadsPath(home), 'A1', 'saved.pdf');

        await createMailFile({ path: filePath });

        const run = buildTestProbeRun({
          environment: home.environment,
          staleCutoffMs: STALE_CUTOFF_MS,
        });
        const unit = getUnitOfKind({
          findings: getProbeFindings(await loadMailDownloadFindings(run)),
          kind: 'mailDownloads',
        });

        function recheck(commandLines: string[] | null): Promise<PathUnitRecheck> {
          return recheckMailDownloadsUnit({
            unit: unit,
            environment: run.environment,
            platform: run.platform,
            runningProcesses: buildRunningCommandLines(commandLines),
          });
        }

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
