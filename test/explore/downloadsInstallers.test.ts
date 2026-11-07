import { expect, test } from 'bun:test';
import { chmod, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { PathUnitRecheck } from '../../src/explore/decideComparisonActivity.js';
import { loadDownloadsInstallerFindings } from '../../src/explore/downloadsInstallers/loadDownloadsInstallerFindings.js';
import { recheckDownloadsUnit } from '../../src/explore/downloadsInstallers/recheckDownloadsUnit.js';
import type { ExploreFinding, ExploreUnit } from '../../src/explore/exploreUnit.js';
import { DAY_MS } from '../../src/scan/limits.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { createFixtureFile, updateModifiedMs } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import type { FixtureHome } from '../support/probeRunFixtures.js';
import {
  buildTestProbeRun,
  getProbeFindings,
  getUnitOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';

// Whole seconds, which the fixture's times keep exactly.
const NOW_MS = Math.floor(Date.now() / 1000) * 1000;
const STALE_CUTOFF_MS = NOW_MS - 30 * DAY_MS;
const OLD_MS = NOW_MS - 90 * DAY_MS;
const FILE_SIZE_BYTES = 4096;

function getDownloadsPath(home: FixtureHome): string {
  return join(home.fixtureRoot.homeDir, 'Downloads');
}

/** Writes a file last changed at `modifiedMs`, by default long ago. */
async function createDownloadsFile(params: { path: string; modifiedMs?: number }): Promise<void> {
  await createFixtureFile({
    path: params.path,
    sizeBytes: FILE_SIZE_BYTES,
    modifiedMs: params.modifiedMs ?? OLD_MS,
  });
}

function buildChromeCommand(home: FixtureHome): string {
  return join(
    home.fixtureRoot.applicationDir,
    'Google Chrome.app',
    'Contents',
    'MacOS',
    'Google Chrome',
  );
}

function findFinding(params: {
  findings: ExploreFinding[];
  kind: ExploreUnit['kind'];
}): ExploreFinding | null {
  return params.findings.find((finding) => finding.unit.kind === params.kind) ?? null;
}

describeAwaitingWin32Platform('the Downloads probe', () => {
  test('finds old installers and stale partial downloads at the top of Downloads', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const downloads = getDownloadsPath(home);
        const safariDownload = join(downloads, 'Movie.mp4.download');
        const safariPartMs = OLD_MS + DAY_MS;

        for (const name of ['Old.dmg', 'Tool.PKG', 'Suite.mpkg', 'Xcode.xip', 'Linux.iso']) {
          await createDownloadsFile({ path: join(downloads, name) });
        }

        await createDownloadsFile({ path: join(downloads, 'New.pkg'), modifiedMs: NOW_MS });
        await createDownloadsFile({ path: join(downloads, 'Report.pdf') });
        await createDownloadsFile({ path: join(downloads, '.Hidden.dmg') });
        await createDownloadsFile({ path: join(downloads, 'Nested', 'Inner.dmg') });
        await createDownloadsFile({ path: join(downloads, 'Big.iso.crdownload') });
        await createDownloadsFile({
          path: join(safariDownload, 'Movie.mp4'),
          modifiedMs: safariPartMs,
        });
        await updateModifiedMs({ path: safariDownload, modifiedMs: OLD_MS });
        await symlink(join(downloads, 'Old.dmg'), join(downloads, 'Link.dmg'));

        const probed = getProbeFindings(
          await loadDownloadsInstallerFindings(
            buildTestProbeRun({ environment: home.environment, staleCutoffMs: STALE_CUTOFF_MS }),
          ),
        );
        const installers = getUnitOfKind({ findings: probed, kind: 'downloadsInstallers' });

        expect(probed.isComplete).toBe(true);
        expect(probed.findings).toHaveLength(3);
        expect(
          findFinding({ findings: probed.findings, kind: 'downloadsInstallers' }),
        ).toMatchObject({
          title: 'Old installers in Downloads',
          risk: 'careful',
          activity: 'idle',
          unit: { kind: 'downloadsInstallers', folderPath: downloads, cutoffMs: STALE_CUTOFF_MS },
        });
        expect(
          installers.foundFiles.toSorted((left, right) => left.path.localeCompare(right.path)),
        ).toEqual(
          ['Linux.iso', 'Old.dmg', 'Suite.mpkg', 'Tool.PKG', 'Xcode.xip'].map((name) => ({
            path: buildTestAbsolutePath({ text: join(downloads, name) }),
            modifiedMs: OLD_MS,
          })),
        );
        expect(
          probed.findings.filter((finding) => finding.unit.kind === 'downloadsIncomplete'),
        ).toMatchObject([
          {
            title: 'Unfinished downloads of Chrome and other Chromium browsers',
            risk: 'safe',
            activity: 'idle',
            unit: {
              browserFamily: 'chromium',
              foundFiles: [
                {
                  path: buildTestAbsolutePath({ text: join(downloads, 'Big.iso.crdownload') }),
                  modifiedMs: OLD_MS,
                },
              ],
            },
          },
          {
            title: 'Unfinished downloads of Safari',
            risk: 'safe',
            activity: 'idle',
            unit: {
              browserFamily: 'safari',
              // A Safari download is a folder: its newest change is the part written last.
              foundFiles: [
                { path: buildTestAbsolutePath({ text: safariDownload }), modifiedMs: safariPartMs },
              ],
            },
          },
        ]);
      },
    });
  });

  test('goes by the stale window, not the unused one', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const downloads = getDownloadsPath(home);

        await createDownloadsFile({ path: join(downloads, 'Old.dmg') });
        await createDownloadsFile({
          path: join(downloads, 'Recent.dmg'),
          modifiedMs: NOW_MS - 10 * DAY_MS,
        });

        const probed = getProbeFindings(
          await loadDownloadsInstallerFindings(
            buildTestProbeRun({
              environment: home.environment,
              staleCutoffMs: STALE_CUTOFF_MS,
              unusedCutoffMs: NOW_MS - 180 * DAY_MS,
            }),
          ),
        );

        expect(
          getUnitOfKind({ findings: probed, kind: 'downloadsInstallers' }).foundFiles.map(
            (file) => file.path,
          ),
        ).toEqual([buildTestAbsolutePath({ text: join(downloads, 'Old.dmg') })]);
      },
    });
  });

  test('keeps a partial download whose newest part is recent', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const safariDownload = join(getDownloadsPath(home), 'A.zip.download');

        await createDownloadsFile({ path: join(safariDownload, 'A.zip'), modifiedMs: NOW_MS });
        await updateModifiedMs({ path: safariDownload, modifiedMs: OLD_MS });

        expect(
          await loadDownloadsInstallerFindings(
            buildTestProbeRun({ environment: home.environment, staleCutoffMs: STALE_CUTOFF_MS }),
          ),
        ).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: true } });
      },
    });
  });

  test("stops a partial download's walk at the deadline and leaves the findings incomplete", async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const downloads = getDownloadsPath(home);
        const safariDownload = join(downloads, 'Movie.mp4.download');

        await createDownloadsFile({ path: join(downloads, 'Old.dmg') });
        await createDownloadsFile({ path: join(safariDownload, 'Movie.mp4') });
        await updateModifiedMs({ path: safariDownload, modifiedMs: OLD_MS });

        const probed = getProbeFindings(
          await loadDownloadsInstallerFindings({
            ...buildTestProbeRun({ environment: home.environment, staleCutoffMs: STALE_CUTOFF_MS }),
            deadlineMs: Date.now() - 1,
          }),
        );

        expect(probed.isComplete).toBe(false);
        expect(probed.findings.map((finding) => finding.unit.kind)).toEqual([
          'downloadsInstallers',
        ]);
      },
    });
  });

  testOnPosix('fails with the path of an entry it cannot read', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const downloads = getDownloadsPath(home);

        await createDownloadsFile({ path: join(downloads, 'Old.dmg') });
        // Listing needs only the read right; reading an entry also needs the search right.
        await chmod(downloads, 0o400);

        expect(
          await loadDownloadsInstallerFindings(
            buildTestProbeRun({ environment: home.environment, staleCutoffMs: STALE_CUTOFF_MS }),
          ),
        ).toMatchObject({
          kind: 'failed',
          failure: { reason: 'fileUnreadable', path: join(downloads, 'Old.dmg') },
        });
      },
    });
  });

  test('tells a partial download busy while a browser of its family runs, an installer never', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const downloads = getDownloadsPath(home);

        await createDownloadsFile({ path: join(downloads, 'Old.dmg') });
        await createDownloadsFile({ path: join(downloads, 'Big.iso.crdownload') });

        const findings = getProbeFindings(
          await loadDownloadsInstallerFindings(
            buildTestProbeRun({
              environment: home.environment,
              processCommands: [buildChromeCommand(home)],
              staleCutoffMs: STALE_CUTOFF_MS,
            }),
          ),
        ).findings;

        expect(findFinding({ findings: findings, kind: 'downloadsIncomplete' })?.activity).toBe(
          'busy',
        );
        expect(findFinding({ findings: findings, kind: 'downloadsInstallers' })?.activity).toBe(
          'idle',
        );
      },
    });
  });

  test('offers a partial download of Firefox while only Chrome runs', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const downloads = getDownloadsPath(home);

        await createDownloadsFile({ path: join(downloads, 'Big.iso.part') });

        const findings = getProbeFindings(
          await loadDownloadsInstallerFindings(
            buildTestProbeRun({
              environment: home.environment,
              processCommands: [buildChromeCommand(home)],
              staleCutoffMs: STALE_CUTOFF_MS,
            }),
          ),
        ).findings;

        expect(findings).toMatchObject([
          {
            title: 'Unfinished downloads of Firefox',
            activity: 'idle',
            unit: { kind: 'downloadsIncomplete', browserFamily: 'firefox' },
          },
        ]);
      },
    });
  });

  test('says the place is missing without a Downloads folder', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        expect(
          await loadDownloadsInstallerFindings(
            buildTestProbeRun({ environment: home.environment, staleCutoffMs: STALE_CUTOFF_MS }),
          ),
        ).toEqual({ kind: 'failed', failure: { reason: 'placeMissing' } });
      },
    });
  });
});

describeAwaitingWin32Platform('recheckDownloadsUnit', () => {
  test('finds a unit unchanged, then changed once a file changed or went', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const downloads = getDownloadsPath(home);

        await createDownloadsFile({ path: join(downloads, 'Old.dmg') });
        await createDownloadsFile({ path: join(downloads, 'Other.pkg') });

        const run = buildTestProbeRun({
          environment: home.environment,
          staleCutoffMs: STALE_CUTOFF_MS,
        });
        const unit = getUnitOfKind({
          findings: getProbeFindings(await loadDownloadsInstallerFindings(run)),
          kind: 'downloadsInstallers',
        });
        function recheck(): Promise<PathUnitRecheck> {
          return recheckDownloadsUnit({
            unit: unit,
            environment: run.environment,
            platform: run.platform,
            processCommands: [],
          });
        }

        expect(await recheck()).toEqual({ kind: 'unchanged' });

        await updateModifiedMs({ path: join(downloads, 'Old.dmg'), modifiedMs: OLD_MS + 1000 });

        expect(await recheck()).toEqual({ kind: 'changed' });

        await updateModifiedMs({ path: join(downloads, 'Old.dmg'), modifiedMs: OLD_MS });
        await rm(join(downloads, 'Other.pkg'));

        expect(await recheck()).toEqual({ kind: 'changed' });
      },
    });
  });

  test('finds a partial download busy while a browser of its family runs, unchanged while another runs', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const downloads = getDownloadsPath(home);

        await createDownloadsFile({ path: join(downloads, 'A.part') });

        const run = buildTestProbeRun({
          environment: home.environment,
          staleCutoffMs: STALE_CUTOFF_MS,
        });
        const unit = getUnitOfKind({
          findings: getProbeFindings(await loadDownloadsInstallerFindings(run)),
          kind: 'downloadsIncomplete',
        });
        const firefoxCommand = join(
          home.fixtureRoot.applicationDir,
          'Firefox.app',
          'Contents',
          'MacOS',
          'firefox',
        );

        const outcomes = [
          await recheckDownloadsUnit({
            unit: unit,
            environment: run.environment,
            platform: run.platform,
            processCommands: [firefoxCommand],
          }),
          await recheckDownloadsUnit({
            unit: unit,
            environment: run.environment,
            platform: run.platform,
            processCommands: [buildChromeCommand(home)],
          }),
        ];

        expect(outcomes).toEqual([{ kind: 'busy' }, { kind: 'unchanged' }]);
      },
    });
  });
});
