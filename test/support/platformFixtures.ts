import type { CatalogEntry } from '../../src/catalog/catalog.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { Platform } from '../../src/platform/platform.js';
import { win32Platform } from '../../src/platform/win32/win32Platform.js';
import type { Result } from '../../src/result.js';
import type { RecycleBinContent } from '../../src/scan/candidate.js';
import type { ToolInstallLocations } from '../../src/tools/toolInstallLocations.js';

/**
 * The Windows platform for a test: the installed apps of the PC and its Recycle Bins stay unread,
 * since the fixture environment names the real drive the fixture root lies on, and no test may
 * empty a bin of it. Every bin counts as empty, so it offers no item.
 */
const TEST_WIN32_PLATFORM: Platform = {
  ...win32Platform,
  scan: {
    ...win32Platform.scan,
    apps: { appSection: 'adviseOnly', loadAdvisedApps: async () => ({ apps: [], issues: [] }) },
    trash: {
      kind: 'recycleBins',
      title: 'Recycle Bin',
      explanation: 'A test bin.',
      regeneration: 'None.',
      risk: 'careful',
      loadRecycleBin: loadEmptyRecycleBin,
    },
  },
  delete: {
    ...win32Platform.delete,
    trash: {
      kind: 'recycleBins',
      loadRecycleBin: loadEmptyRecycleBin,
      emptyRecycleBin: () => ({ kind: 'failed', failure: 'a test never empties a Recycle Bin' }),
    },
  },
};

/** The platform of the host that runs the tests, with what a test must never touch faked. */
export const HOST_PLATFORM: Platform =
  process.platform === 'win32' ? TEST_WIN32_PLATFORM : darwinPlatform;

/**
 * The host's platform of a run on the fixture root: the test's catalog and tools, and no Homebrew
 * prefix, so no test reads the real ones. On macOS the apps come from the app folder of the
 * fixture environment.
 */
export function buildTestPlatform(params: {
  catalogEntries: CatalogEntry[];
  toolInstallLocations: ToolInstallLocations;
}): Platform {
  return {
    ...HOST_PLATFORM,
    catalog: { ...HOST_PLATFORM.catalog, entries: params.catalogEntries },
    tools: {
      ...HOST_PLATFORM.tools,
      installLocations: params.toolInstallLocations,
      homebrewPrefixPaths: [],
    },
  };
}

function loadEmptyRecycleBin(): Result<RecycleBinContent, string> {
  return { kind: 'succeeded', value: { sizeBytes: 0, itemCount: 0 } };
}
