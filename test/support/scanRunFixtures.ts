import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import type { ScanProgress, ScanReport } from '../../src/scan/runScan.js';
import { runScan } from '../../src/scan/runScan.js';
import { TOOL_INSTALL_LOCATIONS_NONE } from './candidateFixtures.js';
import { buildTestPlatform } from './platformFixtures.js';

/**
 * Scans the fixture home of `environment` through the macOS platform with only `catalogEntries`
 * and no tool, the processes, the active Xcode, and the system version made up, so the scan starts
 * no command.
 */
export function runTestScan(params: {
  environment: Environment;
  catalogEntries: CatalogEntry[];
  onProgress?: (progress: ScanProgress) => void;
}): Promise<ScanReport> {
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
      loadRunningProcesses: async () => ({ kind: 'succeeded', value: [] }),
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
