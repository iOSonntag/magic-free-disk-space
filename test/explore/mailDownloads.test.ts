import { expect, test } from 'bun:test';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import { loadMailDownloadFindings } from '../../src/explore/mailDownloads/loadMailDownloadFindings.js';
import { recheckMailDownloadsUnit } from '../../src/explore/mailDownloads/recheckMailDownloadsUnit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

const DAY_MS = 86_400_000;
const NOW_MS = Date.now();
const STALE_CUTOFF_MS = NOW_MS - 30 * DAY_MS;
const OLD_MS = NOW_MS - 90 * DAY_MS;
const MAIL_COMMAND = '/System/Applications/Mail.app/Contents/MacOS/Mail';

async function withFixtureRoot(params: {
  run: (fixtureRoot: FixtureRoot) => Promise<void>;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    await params.run(fixtureRoot);
  } finally {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  }
}

function getMailDownloadsPath(params: { fixtureRoot: FixtureRoot }): string {
  const rootNames = buildTestProbePlatform().explore.mailDownloadsRoot;

  if (rootNames === null) {
    throw new Error('The platform has no Mail Downloads folder.');
  }

  return join(params.fixtureRoot.homeDir, ...rootNames);
}

/**
 * A file Mail saved: an mtime before the birth time moves the birth time back with it on macOS,
 * so a file set to `savedMs` reads as saved then and never changed.
 */
async function createSavedFile(params: {
  path: string;
  savedMs: number;
  modifiedMs?: number;
  accessedMs?: number;
}): Promise<void> {
  await mkdir(dirname(params.path), { recursive: true });
  await writeFile(params.path, Buffer.alloc(4096, 1));
  await utimes(params.path, new Date(params.savedMs), new Date(params.savedMs));

  if (params.modifiedMs !== undefined || params.accessedMs !== undefined) {
    await utimes(
      params.path,
      new Date(params.accessedMs ?? params.savedMs),
      new Date(params.modifiedMs ?? params.savedMs),
    );
  }
}

async function buildRun(params: {
  fixtureRoot: FixtureRoot;
  processCommands?: string[] | null;
}): Promise<ExploreProbeRun> {
  return {
    environment: await loadTestEnvironment({ fixtureRoot: params.fixtureRoot, nowMs: NOW_MS }),
    platform: buildTestProbePlatform(),
    processCommands: params.processCommands === undefined ? [] : params.processCommands,
    deadlineMs: Date.now() + 10_000,
    unusedCutoffMs: STALE_CUTOFF_MS,
    staleCutoffMs: STALE_CUTOFF_MS,
  };
}

describeAwaitingWin32Platform('the Mail Downloads probe', () => {
  test('finds the attachment copies saved and read before the cutoff and never changed', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const folder = getMailDownloadsPath({ fixtureRoot: fixtureRoot });

        await createSavedFile({ path: join(folder, 'A1', 'saved.pdf'), savedMs: OLD_MS });
        await createSavedFile({ path: join(folder, 'B2', 'Deep', 'scan.jpg'), savedMs: OLD_MS });
        // Edited after Mail saved it: the person's own work now.
        await createSavedFile({
          path: join(folder, 'A1', 'edited.docx'),
          savedMs: OLD_MS,
          modifiedMs: OLD_MS + DAY_MS,
        });
        await createSavedFile({
          path: join(folder, 'B2', 'opened.pdf'),
          savedMs: OLD_MS,
          accessedMs: NOW_MS,
        });
        await createSavedFile({ path: join(folder, 'B2', '.DS_Store'), savedMs: OLD_MS });

        const result = await loadMailDownloadFindings(await buildRun({ fixtureRoot: fixtureRoot }));

        expect(result).toEqual({
          kind: 'succeeded',
          value: {
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
          },
        });
      },
    });
  });

  test('tells the attachments busy while Mail runs', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const folder = getMailDownloadsPath({ fixtureRoot: fixtureRoot });

        await createSavedFile({ path: join(folder, 'A1', 'saved.pdf'), savedMs: OLD_MS });

        const result = await loadMailDownloadFindings(
          await buildRun({ fixtureRoot: fixtureRoot, processCommands: [MAIL_COMMAND] }),
        );

        expect(result.kind === 'succeeded' && result.value.findings[0]?.activity).toBe('busy');
      },
    });
  });

  test('says the place is missing without the folder', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        expect(
          await loadMailDownloadFindings(await buildRun({ fixtureRoot: fixtureRoot })),
        ).toEqual({ kind: 'failed', failure: { reason: 'placeMissing' } });
      },
    });
  });
});

describeAwaitingWin32Platform('recheckMailDownloadsUnit', () => {
  test('finds a unit unchanged, then changed once a file was opened or changed', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const folder = getMailDownloadsPath({ fixtureRoot: fixtureRoot });
        const filePath = join(folder, 'A1', 'saved.pdf');

        await createSavedFile({ path: filePath, savedMs: OLD_MS });

        const run = await buildRun({ fixtureRoot: fixtureRoot });
        const result = await loadMailDownloadFindings(run);
        const unit = result.kind === 'succeeded' ? result.value.findings[0]?.unit : undefined;

        if (unit?.kind !== 'mailDownloads') {
          throw new Error('The probe found no attachments.');
        }

        const recheck = (processCommands: string[] | null) =>
          recheckMailDownloadsUnit({
            unit: unit,
            environment: run.environment,
            platform: run.platform,
            processCommands: processCommands,
          });

        expect(await recheck([])).toEqual({ kind: 'unchanged' });
        expect(await recheck([MAIL_COMMAND])).toEqual({ kind: 'busy' });

        await utimes(filePath, new Date(NOW_MS), new Date(OLD_MS));

        expect(await recheck([])).toEqual({ kind: 'changed' });

        await utimes(filePath, new Date(OLD_MS), new Date(OLD_MS + DAY_MS));

        expect(await recheck([])).toEqual({ kind: 'changed' });
      },
    });
  });
});
