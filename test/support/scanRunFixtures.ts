import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import type { ScanProgress, ScanReport } from '../../src/scan/runScan.js';
import { runScan } from '../../src/scan/runScan.js';
import type { RunningProcesses } from '../../src/system/systemPlatform.js';
import { TOOL_INSTALL_LOCATIONS_NONE } from './candidateFixtures.js';
import { buildTestPlatform } from './platformFixtures.js';
import { buildRunningCommandLines } from './runningProcessesFixtures.js';

/**
 * Scans the fixture home of `environment` through the macOS platform with only `catalogEntries`
 * and no tool, the processes (`runningProcesses`, none when left out), the active Xcode, and the
 * system version made up, so the scan starts no command.
 */
export function runTestScan(params: {
  environment: Environment;
  catalogEntries: CatalogEntry[];
  runningProcesses?: RunningProcesses;
  onProgress?: (progress: ScanProgress) => void;
}): Promise<ScanReport> {
  const runningProcesses = params.runningProcesses ?? buildRunningCommandLines([]);

  const platform = buildTestPlatform({
    catalogEntries: params.catalogEntries,
    toolInstallLocations: TOOL_INSTALL_LOCATIONS_NONE,
  });

  return runScan({
    environment: params.environment,
    catalog: platform.catalog,
    tools: platform.tools,
    scan: {
      ...platform.scan,
      loadActiveXcodeBundlePath: async () => ({ kind: 'succeeded', value: null }),
    },
    system: {
      ...platform.system,
      loadRunningProcesses: async () => ({ kind: 'succeeded', value: runningProcesses }),
      loadSystemVersion: async () => null,
    },
    explore: platform.explore,
    options: {
      staleDays: SCAN_LIMITS.defaultStaleDays,
      unusedDays: SCAN_LIMITS.defaultUnusedDays,
    },
    onProgress: params.onProgress ?? (() => undefined),
  });
}

/** The entry `id` of the macOS catalog, for `runTestScan`; throws when the catalog holds none. */
export function getCatalogEntry(id: string): CatalogEntry {
  const entry = darwinPlatform.catalog.entries.find((candidate) => candidate.id === id);

  if (entry === undefined) {
    throw new Error(`The catalog holds no entry ${id}.`);
  }

  return entry;
}
