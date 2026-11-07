import { expect, test } from 'bun:test';
import { dirname, join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { CATALOG_ENTRIES } from '../../src/platform/darwin/catalogEntries.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { decideCatalogCandidate } from '../../src/scan/decideCatalogCandidate.js';
import type { CatalogTarget } from '../../src/scan/findCatalogTargets.js';
import { findCatalogTargets } from '../../src/scan/findCatalogTargets.js';
import {
  buildFoundTargets,
  loadMeasuredTargetsPhase,
} from '../../src/scan/loadMeasuredTargetsPhase.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import { buildScanReportOfPhases } from '../../src/scan/runScan.js';
import type { ScanPhase } from '../../src/scan/scanPhase.js';
import { createConcurrencyLimit } from '../../src/system/createConcurrencyLimit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';

const MODIFIED_MS = Date.UTC(2026, 0, 1);

const NOW_MS = Date.UTC(2026, 6, 1);

const FILE_BYTES = 65_536;

/** The paths below the fixture home: each made with one old file in it. */
const HOME_FILE_PATHS = [
  'Library/Logs/magic-free-disk-space/deletions.jsonl',
  'Library/Logs/com.example.app/app.log',
  'Library/Messages/Caches/Previews/Attachments/ab/preview.jpg',
];

/** Builds the fixture home, scans the given entries as the scan does, and removes the home. */
async function withScannedHome(params: {
  entryIds: string[];
  run: (scan: { fixtureRoot: FixtureRoot; report: ScanReport }) => void;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    for (const path of HOME_FILE_PATHS) {
      await createFixtureDirectory({ path: dirname(join(fixtureRoot.homeDir, path)) });
      await createFixtureFile({
        path: join(fixtureRoot.homeDir, path),
        sizeBytes: FILE_BYTES,
        modifiedMs: MODIFIED_MS,
      });
    }

    const environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });
    const found = await findCatalogTargets({
      environment: environment,
      entries: CATALOG_ENTRIES.filter((entry) => params.entryIds.includes(entry.id)),
      privacyDenialCode: darwinPlatform.system.privacyDenialCode,
    });
    const phases = await Promise.all(found.targets.map((target) => loadTargetPhase({ target })));

    params.run({
      fixtureRoot: fixtureRoot,
      report: buildReport({ environment: environment, phases: phases }),
    });
  } finally {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  }
}

/** The phase of one target, its owner stopped and its files judged untouched. */
function loadTargetPhase(params: { target: CatalogTarget }): Promise<ScanPhase> {
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
        minOfferedBytes: 1,
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

describeAwaitingWin32Platform('the scan of the paths the removal never touches', () => {
  test('the app logs neither offer nor advise the deletion log, and skip it', async () => {
    await withScannedHome({
      entryIds: ['user-logs'],
      run: ({ fixtureRoot, report }) => {
        const logsPath = join(fixtureRoot.homeDir, 'Library/Logs');
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
    await withScannedHome({
      entryIds: ['messages-attachment-previews'],
      run: ({ fixtureRoot, report }) => {
        expect(report.candidates.map((candidate) => candidate.path)).toEqual([
          join(fixtureRoot.homeDir, 'Library/Messages/Caches/Previews/Attachments'),
        ]);
        expect(report.skipped).toEqual([]);
      },
    });
  });
});
