import { expect, test } from 'bun:test';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  ExploreProbeToolResult,
  ExploreProbeToolRun,
} from '../../src/explore/exploreProbe.js';
import type { ExploreFinding } from '../../src/explore/exploreUnit.js';
import { loadIcloudDownloadFindings } from '../../src/explore/icloudDownloads/loadIcloudDownloadFindings.js';
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
const CUTOFF_MS = NOW_MS - 30 * DAY_MS;
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

function getMobileDocumentsPath(params: { fixtureRoot: FixtureRoot }): string {
  return join(params.fixtureRoot.homeDir, 'Library', 'Mobile Documents');
}

async function createTimedFile(params: {
  path: string;
  sizeBytes: number;
  modifiedMs: number;
  accessedMs: number;
}): Promise<void> {
  await mkdir(dirname(params.path), { recursive: true });
  await writeFile(params.path, Buffer.alloc(params.sizeBytes, 1));
  await utimes(params.path, new Date(params.accessedMs), new Date(params.modifiedMs));
}

/** A run over the fixture home; the folders at `evictedPaths` hold only what the cloud holds. */
async function buildRun(params: {
  fixtureRoot: FixtureRoot;
  evictedPaths?: string[];
  hasIcloudDrive?: boolean;
}): Promise<ExploreProbeToolRun> {
  const platform = buildTestProbePlatform();
  const evictedPaths = params.evictedPaths ?? [];

  return {
    environment: await loadTestEnvironment({ fixtureRoot: params.fixtureRoot, nowMs: NOW_MS }),
    platform: {
      ...platform,
      explore: {
        ...platform.explore,
        icloudDriveRoot: params.hasIcloudDrive === false ? null : platform.explore.icloudDriveRoot,
      },
      entryReads: {
        isEntryEvicted: (entry) =>
          evictedPaths.includes(entry.path) || platform.entryReads.isEntryEvicted(entry),
        loadPrivateBytes: platform.entryReads.loadPrivateBytes,
      },
    },
    processCommands: [],
    deadlineMs: Date.now() + 10_000,
    unusedCutoffMs: CUTOFF_MS,
    staleCutoffMs: CUTOFF_MS,
    // The probe reads the disk only; the tool is the one an evict runs later.
    tool: { name: 'brctl', path: '/usr/bin/brctl' },
  };
}

type FindingSummary = {
  title: string;
  risk: string;
  activity: string;
  folderPath: string | null;
  filePaths: string[];
};

/** Each finding by its title, with its folder and the paths of its files. */
function summarizeFindings(findings: ExploreFinding[]): FindingSummary[] {
  return findings
    .map((finding) => ({
      title: finding.title,
      risk: finding.risk,
      activity: finding.activity,
      folderPath: finding.unit.kind === 'icloudFolder' ? finding.unit.folderPath : null,
      filePaths:
        finding.unit.kind === 'icloudFolder'
          ? finding.unit.foundFiles.map((file) => file.path).toSorted()
          : [],
    }))
    .toSorted((left, right) => left.title.localeCompare(right.title));
}

describeAwaitingWin32Platform('the iCloud Drive probe', () => {
  test('finds downloaded files untouched since the cutoff, one unit per folder', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const root = getMobileDocumentsPath({ fixtureRoot: fixtureRoot });
        const cloudDocs = join(root, 'com~apple~CloudDocs');
        const oldFile = { sizeBytes: 8192, modifiedMs: OLD_MS, accessedMs: OLD_MS };

        await createTimedFile({ path: join(cloudDocs, 'Projects', 'old.txt'), ...oldFile });
        await createTimedFile({
          path: join(cloudDocs, 'Projects', 'Deep', 'older.txt'),
          ...oldFile,
        });
        await createTimedFile({
          path: join(cloudDocs, 'Projects', 'changed.txt'),
          sizeBytes: 8192,
          modifiedMs: NOW_MS,
          accessedMs: OLD_MS,
        });
        await createTimedFile({
          path: join(cloudDocs, 'Projects', 'read.txt'),
          sizeBytes: 8192,
          modifiedMs: OLD_MS,
          accessedMs: NOW_MS,
        });
        await createTimedFile({ path: join(cloudDocs, 'Projects', '.hidden'), ...oldFile });
        await createTimedFile({ path: join(cloudDocs, '.Trash', 'gone.txt'), ...oldFile });
        await createTimedFile({ path: join(cloudDocs, 'loose.pdf'), ...oldFile });
        await createTimedFile({
          path: join(root, 'iCloud~md~obsidian', 'Documents', 'note.md'),
          ...oldFile,
        });
        // Nothing of it is on this disk: an empty file has no blocks, as an evicted one.
        await createTimedFile({
          path: join(root, 'iCloud~com~example~app', 'evicted.bin'),
          sizeBytes: 0,
          modifiedMs: OLD_MS,
          accessedMs: OLD_MS,
        });

        const result = await loadIcloudDownloadFindings(
          await buildRun({ fixtureRoot: fixtureRoot }),
        );

        expect(result.kind).toBe('succeeded');
        expect(result.kind === 'succeeded' && result.value.isComplete).toBe(true);
        expect(result.kind === 'succeeded' && summarizeFindings(result.value.findings)).toEqual([
          {
            title: 'Downloaded iCloud Drive files in iCloud Drive',
            risk: 'review',
            activity: 'idle',
            folderPath: cloudDocs,
            filePaths: [join(cloudDocs, 'loose.pdf')],
          },
          {
            title: 'Downloaded iCloud Drive files in obsidian',
            risk: 'review',
            activity: 'idle',
            folderPath: join(root, 'iCloud~md~obsidian'),
            filePaths: [join(root, 'iCloud~md~obsidian', 'Documents', 'note.md')],
          },
          {
            title: 'Downloaded iCloud Drive files in Projects',
            risk: 'review',
            activity: 'idle',
            folderPath: join(cloudDocs, 'Projects'),
            filePaths: [
              join(cloudDocs, 'Projects', 'Deep', 'older.txt'),
              join(cloudDocs, 'Projects', 'old.txt'),
            ],
          },
        ]);
      },
    });
  });

  test('keeps the times the scan read on each file, for the evict to compare', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const filePath = join(
          getMobileDocumentsPath({ fixtureRoot: fixtureRoot }),
          'com~apple~CloudDocs',
          'Projects',
          'old.txt',
        );
        const accessedMs = OLD_MS + DAY_MS;

        await createTimedFile({
          path: filePath,
          sizeBytes: 8192,
          modifiedMs: OLD_MS,
          accessedMs: accessedMs,
        });

        const result = await loadIcloudDownloadFindings(
          await buildRun({ fixtureRoot: fixtureRoot }),
        );
        const unit = result.kind === 'succeeded' ? result.value.findings[0]?.unit : undefined;

        expect(unit?.kind === 'icloudFolder' && unit.foundFiles).toEqual([
          {
            path: buildTestAbsolutePath({ text: filePath }),
            modifiedMs: OLD_MS,
            accessedMs: accessedMs,
          },
        ]);
        expect(unit?.kind === 'icloudFolder' && unit.tool).toEqual({
          name: 'brctl',
          path: '/usr/bin/brctl',
        });
      },
    });
  });

  test('never reads a folder whose content only the cloud holds', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const root = getMobileDocumentsPath({ fixtureRoot: fixtureRoot });
        const cloudDocs = join(root, 'com~apple~CloudDocs');
        const oldFile = { sizeBytes: 8192, modifiedMs: OLD_MS, accessedMs: OLD_MS };

        await createTimedFile({
          path: join(cloudDocs, 'Projects', 'Archive', 'a.txt'),
          ...oldFile,
        });
        await createTimedFile({ path: join(cloudDocs, 'Projects', 'kept.txt'), ...oldFile });
        await createTimedFile({ path: join(cloudDocs, 'Photos', 'b.jpg'), ...oldFile });

        const evictedPaths = [join(cloudDocs, 'Projects', 'Archive'), join(cloudDocs, 'Photos')];
        const result = await loadIcloudDownloadFindings(
          await buildRun({ fixtureRoot: fixtureRoot, evictedPaths: evictedPaths }),
        );

        expect(result.kind === 'succeeded' && summarizeFindings(result.value.findings)).toEqual([
          {
            title: 'Downloaded iCloud Drive files in Projects',
            risk: 'review',
            activity: 'idle',
            folderPath: join(cloudDocs, 'Projects'),
            filePaths: [join(cloudDocs, 'Projects', 'kept.txt')],
          },
        ]);

        const allEvicted = await loadIcloudDownloadFindings(
          await buildRun({ fixtureRoot: fixtureRoot, evictedPaths: [cloudDocs] }),
        );

        expect(allEvicted).toEqual({
          kind: 'succeeded',
          value: { findings: [], isComplete: true },
        });
      },
    });
  });

  test('says the place is missing without iCloud Drive or its folder', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const missing: ExploreProbeToolResult = {
          kind: 'failed',
          failure: { reason: 'placeMissing' },
        };

        expect(
          await loadIcloudDownloadFindings(await buildRun({ fixtureRoot: fixtureRoot })),
        ).toEqual(missing);

        await mkdir(getMobileDocumentsPath({ fixtureRoot: fixtureRoot }), { recursive: true });

        expect(
          await loadIcloudDownloadFindings(
            await buildRun({ fixtureRoot: fixtureRoot, hasIcloudDrive: false }),
          ),
        ).toEqual(missing);
      },
    });
  });
});
