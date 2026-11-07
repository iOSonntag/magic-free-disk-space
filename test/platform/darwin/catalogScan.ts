import { dirname, join, relative } from 'node:path';
import type { Environment } from '../../../src/environment/buildEnvironment.js';
import { CATALOG_ENTRIES } from '../../../src/platform/darwin/catalogEntries.js';
import { darwinPlatform } from '../../../src/platform/darwin/darwinPlatform.js';
import { decideCatalogCandidate } from '../../../src/scan/decideCatalogCandidate.js';
import type { CatalogTarget } from '../../../src/scan/findCatalogTargets.js';
import { findCatalogTargets } from '../../../src/scan/findCatalogTargets.js';
import {
  buildFoundTargets,
  loadMeasuredTargetsPhase,
} from '../../../src/scan/loadMeasuredTargetsPhase.js';
import type { ScanReport } from '../../../src/scan/runScan.js';
import { buildScanReportOfPhases } from '../../../src/scan/runScan.js';
import type { ScanPhase } from '../../../src/scan/scanPhase.js';
import { createConcurrencyLimit } from '../../../src/system/createConcurrencyLimit.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../../support/fixtureRoot.js';

/** When every file of a scanned home was last changed, long before the scan. */
const FIXTURE_FILE_MODIFIED_MS = Date.UTC(2026, 0, 1);

const SCAN_NOW_MS = Date.UTC(2026, 6, 1);

/** One file below the fixture home, by its path relative to the home. */
export type HomeFixtureFile = { path: string; sizeBytes: number };

/**
 * Builds a fixture home of old files, scans the given catalog entries as the scan does, in the
 * catalog's order, and removes the home after `run`. Each owner counts as stopped and each tree
 * as untouched, so only the selection, the size floor, and the giving way decide an offer.
 */
export async function withScannedCatalogHome(params: {
  entryIds: string[];
  files: HomeFixtureFile[];
  minOfferedBytes: number;
  run: (scan: { homeDir: string; report: ScanReport }) => void;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    for (const file of params.files) {
      const path = join(fixtureRoot.homeDir, file.path);

      await createFixtureDirectory({ path: dirname(path) });
      await createFixtureFile({
        path: path,
        sizeBytes: file.sizeBytes,
        modifiedMs: FIXTURE_FILE_MODIFIED_MS,
      });
    }

    const environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: SCAN_NOW_MS });
    const found = await findCatalogTargets({
      environment: environment,
      entries: CATALOG_ENTRIES.filter((entry) => params.entryIds.includes(entry.id)),
      privacyDenialCode: darwinPlatform.system.privacyDenialCode,
    });
    const phases = await Promise.all(
      found.targets.map((target) =>
        loadTargetPhase({ target: target, minOfferedBytes: params.minOfferedBytes }),
      ),
    );

    params.run({
      homeDir: fixtureRoot.homeDir,
      report: buildReport({ environment: environment, phases: phases }),
    });
  } finally {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  }
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

function loadTargetPhase(params: {
  target: CatalogTarget;
  minOfferedBytes: number;
}): Promise<ScanPhase> {
  const entry = params.target.entry;

  return loadMeasuredTargetsPhase({
    found: buildFoundTargets(params.target.targetPaths),
    carve: null,
    measureTimeoutMs: 10_000,
    runItemMeasurement: createConcurrencyLimit({ maxConcurrent: 1 }),
    entryReads: darwinPlatform.system.entryReads,
    privacyDenialCode: darwinPlatform.system.privacyDenialCode,
    decide: async (measurement) =>
      decideCatalogCandidate({
        entry: entry,
        path: params.target.path,
        measurement: measurement,
        owner: entry.owner,
        ownerBundlePaths: [],
        ownerState: 'stopped',
        ownerAppName: null,
        activity: entry.ageRule.kind === 'none' ? null : 'quiet',
        minOfferedBytes: params.minOfferedBytes,
        carvedPaths: [],
      }),
  });
}

function buildReport(params: { environment: Environment; phases: ScanPhase[] }): ScanReport {
  return buildScanReportOfPhases({
    environment: params.environment,
    reservedEntryPaths: [],
    phases: params.phases,
    incompleteExploreAdvice: { decisions: [], issues: [] },
  });
}
