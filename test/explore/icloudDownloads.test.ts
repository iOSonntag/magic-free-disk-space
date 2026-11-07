import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Risk } from '../../src/catalog/catalog.js';
import type {
  ExploreProbeToolResult,
  ExploreProbeToolRun,
} from '../../src/explore/exploreProbe.js';
import type { ExploreFinding, UnitActivity } from '../../src/explore/exploreUnit.js';
import {
  isEvictableFile,
  isEvictFileUnchanged,
} from '../../src/explore/icloudDownloads/decideEvictFile.js';
import { loadIcloudDownloadFindings } from '../../src/explore/icloudDownloads/loadIcloudDownloadFindings.js';
import { DAY_MS } from '../../src/scan/limits.js';
import type { EntryStats } from '../../src/system/loadEntryStats.js';
import type { FileIdentity } from '../../src/system/loadFileIdentity.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { createFixtureDirectory, createFixtureFile } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import type { FixtureHome } from '../support/probeRunFixtures.js';
import {
  buildTestProbeToolRun,
  getProbeFindings,
  getUnitOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';

// Whole seconds, which the fixture's times keep exactly.
const NOW_MS = Math.floor(Date.now() / 1000) * 1000;
const CUTOFF_MS = NOW_MS - 30 * DAY_MS;
const OLD_MS = NOW_MS - 90 * DAY_MS;
const FILE_SIZE_BYTES = 8192;

/** The probe reads the disk only; the tool is the one an evict runs later. */
const BRCTL_TOOL: LocatedTool = { name: 'brctl', path: '/usr/bin/brctl' };

/** A downloaded file, last changed and read long before the cutoff. */
const VALUE_STATS: EntryStats = {
  kind: 'file',
  dev: 1n,
  ino: 2n,
  allocatedBytes: FILE_SIZE_BYTES,
  linkCount: 1,
  modifiedMs: OLD_MS,
  accessedMs: OLD_MS,
  bornMs: OLD_MS,
};

/** The identity the evict read of the file of `VALUE_STATS`. */
const VALUE_IDENTITY: FileIdentity = {
  dev: 1n,
  ino: 2n,
  birthtimeNs: BigInt(OLD_MS) * 1_000_000n,
  kind: 'file',
  realPath: '/Users/example/Library/Mobile Documents/com~apple~CloudDocs/old.txt',
};

function getMobileDocumentsPath(params: { home: FixtureHome }): string {
  return join(params.home.environment.homeDir, 'Library', 'Mobile Documents');
}

/** Writes a file changed and read at the given times, by default long ago. */
async function createIcloudFile(params: {
  path: string;
  sizeBytes?: number;
  modifiedMs?: number;
  accessedMs?: number;
}): Promise<void> {
  await createFixtureFile({
    path: params.path,
    sizeBytes: params.sizeBytes ?? FILE_SIZE_BYTES,
    modifiedMs: params.modifiedMs ?? OLD_MS,
    accessedMs: params.accessedMs ?? OLD_MS,
  });
}

/** A run over the fixture home; the folders at `evictedPaths` hold only what the cloud holds. */
function buildRun(params: {
  home: FixtureHome;
  evictedPaths?: string[];
  hasIcloudDrive?: boolean;
}): ExploreProbeToolRun {
  const platform = buildTestProbePlatform();
  const evictedPaths = params.evictedPaths ?? [];

  return buildTestProbeToolRun({
    environment: params.home.environment,
    tool: BRCTL_TOOL,
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
    cutoffMs: CUTOFF_MS,
  });
}

type FindingSummary = {
  title: string;
  risk: Risk;
  activity: UnitActivity;
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

describe('isEvictableFile', () => {
  test('takes a downloaded file untouched before the cutoff, and nothing else', () => {
    const cases: EntryStats[] = [
      VALUE_STATS,
      // Changed at the cutoff itself.
      { ...VALUE_STATS, modifiedMs: CUTOFF_MS },
      { ...VALUE_STATS, accessedMs: NOW_MS },
      // Only the cloud holds its content.
      { ...VALUE_STATS, allocatedBytes: 0 },
      { ...VALUE_STATS, kind: 'symbolicLink' },
    ];

    expect(cases.map((stats) => isEvictableFile({ stats: stats, cutoffMs: CUTOFF_MS }))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('isEvictFileUnchanged', () => {
  test('holds only for the same file, still downloaded, with the times the scan read', () => {
    const cases: EntryStats[] = [
      VALUE_STATS,
      { ...VALUE_STATS, dev: 9n },
      { ...VALUE_STATS, ino: 9n },
      // A file born later that took the inode number of the deleted one.
      { ...VALUE_STATS, bornMs: OLD_MS + 1000 },
      { ...VALUE_STATS, allocatedBytes: 0 },
      { ...VALUE_STATS, modifiedMs: OLD_MS + 1 },
      { ...VALUE_STATS, accessedMs: OLD_MS + 1 },
      { ...VALUE_STATS, kind: 'symbolicLink' },
    ];

    expect(
      cases.map((stats) =>
        isEvictFileUnchanged({
          stats: stats,
          identity: VALUE_IDENTITY,
          modifiedMs: OLD_MS,
          accessedMs: OLD_MS,
        }),
      ),
    ).toEqual([true, false, false, false, false, false, false, false]);
  });
});

describeAwaitingWin32Platform('the iCloud Drive probe', () => {
  test('finds downloaded files untouched since the cutoff, one unit per folder', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const root = getMobileDocumentsPath({ home: home });
        const cloudDocs = join(root, 'com~apple~CloudDocs');

        await createIcloudFile({ path: join(cloudDocs, 'Projects', 'old.txt') });
        await createIcloudFile({ path: join(cloudDocs, 'Projects', 'Deep', 'older.txt') });
        await createIcloudFile({
          path: join(cloudDocs, 'Projects', 'changed.txt'),
          modifiedMs: NOW_MS,
        });
        await createIcloudFile({
          path: join(cloudDocs, 'Projects', 'read.txt'),
          accessedMs: NOW_MS,
        });
        await createIcloudFile({ path: join(cloudDocs, 'Projects', '.hidden') });
        await createIcloudFile({ path: join(cloudDocs, '.Trash', 'gone.txt') });
        await createIcloudFile({ path: join(cloudDocs, 'loose.pdf') });
        await createIcloudFile({ path: join(root, 'iCloud~md~obsidian', 'Documents', 'note.md') });
        // Nothing of it is on this disk: an empty file has no blocks, as an evicted one.
        await createIcloudFile({
          path: join(root, 'iCloud~com~example~app', 'evicted.bin'),
          sizeBytes: 0,
        });

        const probed = getProbeFindings(await loadIcloudDownloadFindings(buildRun({ home: home })));

        expect(probed.isComplete).toBe(true);
        expect(summarizeFindings(probed.findings)).toEqual([
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
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const filePath = join(
          getMobileDocumentsPath({ home: home }),
          'com~apple~CloudDocs',
          'Projects',
          'old.txt',
        );
        const accessedMs = OLD_MS + DAY_MS;

        await createIcloudFile({ path: filePath, accessedMs: accessedMs });

        const unit = getUnitOfKind({
          findings: getProbeFindings(await loadIcloudDownloadFindings(buildRun({ home: home }))),
          kind: 'icloudFolder',
        });

        expect(unit.foundFiles).toEqual([
          {
            path: buildTestAbsolutePath({ text: filePath }),
            modifiedMs: OLD_MS,
            accessedMs: accessedMs,
          },
        ]);
        expect(unit.tool).toEqual(BRCTL_TOOL);
      },
    });
  });

  test('never reads a folder whose content only the cloud holds', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const cloudDocs = join(getMobileDocumentsPath({ home: home }), 'com~apple~CloudDocs');

        await createIcloudFile({ path: join(cloudDocs, 'Projects', 'Archive', 'a.txt') });
        await createIcloudFile({ path: join(cloudDocs, 'Projects', 'kept.txt') });
        await createIcloudFile({ path: join(cloudDocs, 'Photos', 'b.jpg') });

        const evictedPaths = [join(cloudDocs, 'Projects', 'Archive'), join(cloudDocs, 'Photos')];
        const probed = getProbeFindings(
          await loadIcloudDownloadFindings(buildRun({ home: home, evictedPaths: evictedPaths })),
        );

        expect(summarizeFindings(probed.findings)).toEqual([
          {
            title: 'Downloaded iCloud Drive files in Projects',
            risk: 'review',
            activity: 'idle',
            folderPath: join(cloudDocs, 'Projects'),
            filePaths: [join(cloudDocs, 'Projects', 'kept.txt')],
          },
        ]);
        expect(
          await loadIcloudDownloadFindings(buildRun({ home: home, evictedPaths: [cloudDocs] })),
        ).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: true } });
      },
    });
  });

  test('says the place is missing without iCloud Drive or its folder', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const missing: ExploreProbeToolResult = {
          kind: 'failed',
          failure: { reason: 'placeMissing' },
        };

        expect(await loadIcloudDownloadFindings(buildRun({ home: home }))).toEqual(missing);

        await createFixtureDirectory({
          path: getMobileDocumentsPath({ home: home }),
        });

        expect(
          await loadIcloudDownloadFindings(buildRun({ home: home, hasIcloudDrive: false })),
        ).toEqual(missing);
      },
    });
  });
});
