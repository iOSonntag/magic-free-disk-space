import { expect, test } from 'bun:test';
import { mkdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadDownloadsInstallerFindings } from '../../src/explore/downloadsInstallers/loadDownloadsInstallerFindings.js';
import { recheckDownloadsUnit } from '../../src/explore/downloadsInstallers/recheckDownloadsUnit.js';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type { ExploreFinding } from '../../src/explore/exploreUnit.js';
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

async function createOldFile(params: { path: string; modifiedMs?: number }): Promise<void> {
  const modifiedMs = params.modifiedMs ?? OLD_MS;

  await mkdir(dirname(params.path), { recursive: true });
  await writeFile(params.path, Buffer.alloc(4096, 1));
  await utimes(params.path, new Date(modifiedMs), new Date(modifiedMs));
}

async function setModifiedMs(params: { path: string; modifiedMs: number }): Promise<void> {
  await utimes(params.path, new Date(params.modifiedMs), new Date(params.modifiedMs));
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

function getDownloadsPath(params: { fixtureRoot: FixtureRoot }): string {
  return join(params.fixtureRoot.homeDir, 'Downloads');
}

function findFinding(params: { findings: ExploreFinding[]; kind: string }): ExploreFinding | null {
  return params.findings.find((finding) => finding.unit.kind === params.kind) ?? null;
}

describeAwaitingWin32Platform('the Downloads probe', () => {
  test('finds old installers and stale partial downloads at the top of Downloads', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const downloads = getDownloadsPath({ fixtureRoot: fixtureRoot });
        const safariDownload = join(downloads, 'Movie.mp4.download');
        const safariPartMs = OLD_MS + DAY_MS;

        await createOldFile({ path: join(downloads, 'Old.dmg') });
        await createOldFile({ path: join(downloads, 'Tool.PKG') });
        await createOldFile({ path: join(downloads, 'New.pkg'), modifiedMs: NOW_MS });
        await createOldFile({ path: join(downloads, 'Report.pdf') });
        await createOldFile({ path: join(downloads, '.Hidden.dmg') });
        await createOldFile({ path: join(downloads, 'Nested', 'Inner.dmg') });
        await createOldFile({ path: join(downloads, 'Big.iso.crdownload') });
        await createOldFile({ path: join(safariDownload, 'Movie.mp4'), modifiedMs: safariPartMs });
        await setModifiedMs({ path: safariDownload, modifiedMs: OLD_MS });
        await symlink(join(downloads, 'Old.dmg'), join(downloads, 'Link.dmg'));

        const result = await loadDownloadsInstallerFindings(
          await buildRun({ fixtureRoot: fixtureRoot }),
        );
        const findings = result.kind === 'succeeded' ? result.value.findings : [];
        const installers = findFinding({ findings: findings, kind: 'downloadsInstallers' });
        const incomplete = findFinding({ findings: findings, kind: 'downloadsIncomplete' });

        expect(result.kind === 'succeeded' && result.value.isComplete).toBe(true);
        expect(findings).toHaveLength(2);
        expect(installers).toMatchObject({
          title: 'Old installers in Downloads',
          risk: 'careful',
          activity: 'idle',
          unit: {
            kind: 'downloadsInstallers',
            folderPath: downloads,
            cutoffMs: STALE_CUTOFF_MS,
          },
        });
        expect(
          installers?.unit.kind === 'downloadsInstallers' &&
            installers.unit.foundFiles.toSorted((left, right) =>
              left.path.localeCompare(right.path),
            ),
        ).toEqual([
          { path: buildTestAbsolutePath({ text: join(downloads, 'Old.dmg') }), modifiedMs: OLD_MS },
          {
            path: buildTestAbsolutePath({ text: join(downloads, 'Tool.PKG') }),
            modifiedMs: OLD_MS,
          },
        ]);
        expect(incomplete).toMatchObject({
          title: 'Unfinished downloads in Downloads',
          risk: 'safe',
          activity: 'idle',
        });
        expect(
          incomplete?.unit.kind === 'downloadsIncomplete' &&
            incomplete.unit.foundFiles.toSorted((left, right) =>
              left.path.localeCompare(right.path),
            ),
        ).toEqual([
          {
            path: buildTestAbsolutePath({ text: join(downloads, 'Big.iso.crdownload') }),
            modifiedMs: OLD_MS,
          },
          // A Safari download is a folder: its newest change is the part written last.
          { path: buildTestAbsolutePath({ text: safariDownload }), modifiedMs: safariPartMs },
        ]);
      },
    });
  });

  test('keeps a partial download whose newest part is recent', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const safariDownload = join(
          getDownloadsPath({ fixtureRoot: fixtureRoot }),
          'A.zip.download',
        );

        await createOldFile({ path: join(safariDownload, 'A.zip'), modifiedMs: NOW_MS });
        await setModifiedMs({ path: safariDownload, modifiedMs: OLD_MS });

        expect(
          await loadDownloadsInstallerFindings(await buildRun({ fixtureRoot: fixtureRoot })),
        ).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: true } });
      },
    });
  });

  test('tells a partial download busy while a browser runs, an installer never', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const downloads = getDownloadsPath({ fixtureRoot: fixtureRoot });

        await createOldFile({ path: join(downloads, 'Old.dmg') });
        await createOldFile({ path: join(downloads, 'Big.iso.part') });

        const chromeCommand = join(
          fixtureRoot.applicationDir,
          'Google Chrome.app',
          'Contents',
          'MacOS',
          'Google Chrome',
        );
        const result = await loadDownloadsInstallerFindings(
          await buildRun({ fixtureRoot: fixtureRoot, processCommands: [chromeCommand] }),
        );
        const findings = result.kind === 'succeeded' ? result.value.findings : [];

        expect(findFinding({ findings: findings, kind: 'downloadsIncomplete' })?.activity).toBe(
          'busy',
        );
        expect(findFinding({ findings: findings, kind: 'downloadsInstallers' })?.activity).toBe(
          'idle',
        );
      },
    });
  });

  test('says the place is missing without a Downloads folder', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        expect(
          await loadDownloadsInstallerFindings(await buildRun({ fixtureRoot: fixtureRoot })),
        ).toEqual({ kind: 'failed', failure: { reason: 'placeMissing' } });
      },
    });
  });
});

describeAwaitingWin32Platform('recheckDownloadsUnit', () => {
  test('finds a unit unchanged, then changed once a file changed or went', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const downloads = getDownloadsPath({ fixtureRoot: fixtureRoot });

        await createOldFile({ path: join(downloads, 'Old.dmg') });
        await createOldFile({ path: join(downloads, 'Other.pkg') });

        const run = await buildRun({ fixtureRoot: fixtureRoot });
        const result = await loadDownloadsInstallerFindings(run);
        const unit = result.kind === 'succeeded' ? result.value.findings[0]?.unit : undefined;

        if (unit?.kind !== 'downloadsInstallers') {
          throw new Error('The probe found no installers.');
        }

        const recheck = () =>
          recheckDownloadsUnit({
            unit: unit,
            environment: run.environment,
            platform: run.platform,
            processCommands: [],
          });

        expect(await recheck()).toEqual({ kind: 'unchanged' });

        await setModifiedMs({ path: join(downloads, 'Old.dmg'), modifiedMs: OLD_MS + 1000 });

        expect(await recheck()).toEqual({ kind: 'changed' });

        await setModifiedMs({ path: join(downloads, 'Old.dmg'), modifiedMs: OLD_MS });
        await rm(join(downloads, 'Other.pkg'));

        expect(await recheck()).toEqual({ kind: 'changed' });
      },
    });
  });

  test('finds a partial download busy while a browser runs', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        await createOldFile({
          path: join(getDownloadsPath({ fixtureRoot: fixtureRoot }), 'A.part'),
        });

        const run = await buildRun({ fixtureRoot: fixtureRoot });
        const result = await loadDownloadsInstallerFindings(run);
        const unit = result.kind === 'succeeded' ? result.value.findings[0]?.unit : undefined;

        if (unit?.kind !== 'downloadsIncomplete') {
          throw new Error('The probe found no partial download.');
        }

        expect(
          await recheckDownloadsUnit({
            unit: unit,
            environment: run.environment,
            platform: run.platform,
            processCommands: [
              join(fixtureRoot.applicationDir, 'Firefox.app', 'Contents', 'MacOS', 'firefox'),
            ],
          }),
        ).toEqual({ kind: 'busy' });
      },
    });
  });
});
