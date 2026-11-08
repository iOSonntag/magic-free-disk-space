import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { CatalogPlatform } from '../../src/catalog/catalogPlatform.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { Platform } from '../../src/platform/platform.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import type { ScanProgress, ScanReport } from '../../src/scan/runScan.js';
import { runScan } from '../../src/scan/runScan.js';
import type { EntryReads } from '../../src/system/entryReads.js';
import type { RunningProcessesResult } from '../../src/system/systemPlatform.js';
import { TOOL_INSTALL_LOCATIONS_NONE } from './candidateFixtures.js';
import { buildTestPlatform } from './platformFixtures.js';
import { buildHostRunningProcesses } from './runningProcessesFixtures.js';

/**
 * Scans the fixture home of `environment` through the host's platform with only `catalogEntries`
 * and no tool, the processes (`runningProcesses`, none when left out), the active Xcode, and the
 * system version made up, so the scan starts no command. `entryReads` replaces the platform's.
 */
export function runTestScan(params: {
  environment: Environment;
  catalogEntries: CatalogEntry[];
  runningProcesses?: RunningProcessesResult;
  entryReads?: EntryReads;
  onProgress?: (progress: ScanProgress) => void;
}): Promise<ScanReport> {
  const runningProcesses = params.runningProcesses ?? {
    kind: 'succeeded',
    value: buildHostRunningProcesses({ commandLines: [], imagePaths: [] }),
  };
  const platform = buildTestPlatform({
    catalogEntries: params.catalogEntries,
    toolInstallLocations: TOOL_INSTALL_LOCATIONS_NONE,
  });
  const scanPlatform: Platform = {
    ...platform,
    scan: {
      ...platform.scan,
      loadActiveXcodeBundlePath: async () => ({ kind: 'succeeded', value: null }),
    },
    system: {
      ...platform.system,
      entryReads: params.entryReads ?? platform.system.entryReads,
      loadRunningProcesses: async () => runningProcesses,
      loadSystemVersion: async () => null,
    },
  };

  return runTestScanOnPlatform({
    environment: params.environment,
    platform: scanPlatform,
    onProgress: params.onProgress ?? ignoreScanProgress,
  });
}

/**
 * Scans the fixture home of `environment` through `platform` as it is, with the default ages of the
 * command line.
 */
export function runTestScanOnPlatform(params: {
  environment: Environment;
  platform: Platform;
  onProgress?: (progress: ScanProgress) => void;
}): Promise<ScanReport> {
  return runScan({
    environment: params.environment,
    catalog: params.platform.catalog,
    tools: params.platform.tools,
    scan: params.platform.scan,
    system: params.platform.system,
    explore: params.platform.explore,
    options: {
      staleDays: SCAN_LIMITS.defaultStaleDays,
      unusedDays: SCAN_LIMITS.defaultUnusedDays,
    },
    onProgress: params.onProgress ?? ignoreScanProgress,
  });
}

/** The entry `id` of `catalog`, the macOS one when left out; throws when the catalog holds none. */
export function getCatalogEntry(
  id: string,
  catalog: CatalogPlatform = darwinPlatform.catalog,
): CatalogEntry {
  const entry = catalog.entries.find((candidate) => candidate.id === id);

  if (entry === undefined) {
    throw new Error(`The catalog holds no entry ${id}.`);
  }

  return entry;
}

function ignoreScanProgress(): undefined {
  return undefined;
}
