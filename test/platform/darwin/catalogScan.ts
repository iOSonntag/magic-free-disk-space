import { dirname, join, relative } from 'node:path';
import { darwinPlatform } from '../../../src/platform/darwin/darwinPlatform.js';
import type { ScanReport } from '../../../src/scan/runScan.js';
import {
  createFixtureFile,
  loadTestEnvironment,
  updateModifiedMs,
  withFixtureRoot,
} from '../../support/fixtureRoot.js';
import { runTestScan } from '../../support/scanRunFixtures.js';

/** When every file and folder of a scanned home was last changed, long before the scan. */
const FIXTURE_MODIFIED_MS = Date.UTC(2026, 0, 1);

const SCAN_NOW_MS = Date.UTC(2026, 6, 1);

/** One file below the fixture home, by its path relative to the home. */
export type HomeFixtureFile = { path: string; sizeBytes: number };

/**
 * Builds a fixture home of old files and folders, scans it with only the given entries of the
 * macOS catalog, in the catalog's order, and removes the home after `run`.
 */
export async function withScannedCatalogHome(params: {
  entryIds: string[];
  files: HomeFixtureFile[];
  run: (scan: { homeDir: string; report: ScanReport }) => void;
}): Promise<void> {
  await withFixtureRoot({
    run: async (fixtureRoot) => {
      for (const file of params.files) {
        await createFixtureFile({
          path: join(fixtureRoot.homeDir, file.path),
          sizeBytes: file.sizeBytes,
          modifiedMs: FIXTURE_MODIFIED_MS,
        });
      }

      // Each file just changed the folders it was created in, which an age rule reads as well.
      for (const file of params.files) {
        for (const folderPath of listFolderPathsBelowHome(file.path)) {
          await updateModifiedMs({
            path: join(fixtureRoot.homeDir, folderPath),
            modifiedMs: FIXTURE_MODIFIED_MS,
          });
        }
      }

      const report = await runTestScan({
        environment: await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: SCAN_NOW_MS }),
        catalogEntries: darwinPlatform.catalog.entries.filter((entry) =>
          params.entryIds.includes(entry.id),
        ),
      });

      params.run({ homeDir: fixtureRoot.homeDir, report: report });
    },
  });
}

/** One offer of a scan: its catalog entry, and its path and the paths it deletes, below the home. */
export type CatalogOffer = { entryId: string | null; path: string; deletedPaths: string[] };

/** Each offer of a report, its paths relative to the home. */
export function listCatalogOffers(params: { report: ScanReport; homeDir: string }): CatalogOffer[] {
  return params.report.candidates.map((candidate) => ({
    entryId: candidate.origin.kind === 'catalog' ? candidate.origin.entryId : null,
    path: relative(params.homeDir, candidate.path),
    deletedPaths:
      candidate.removal.kind === 'deletePaths'
        ? candidate.removal.targets.map((target) => relative(params.homeDir, target.path))
        : [],
  }));
}

/** The folders that hold the file at `path`, relative to the home, the home itself left out. */
function listFolderPathsBelowHome(path: string): string[] {
  const folderPath = dirname(path);

  if (folderPath === '.') {
    return [];
  }

  return [folderPath, ...listFolderPathsBelowHome(folderPath)];
}
