import type { CatalogEntry } from '../../src/catalog/catalog.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { Platform } from '../../src/platform/platform.js';
import type { ToolInstallLocations } from '../../src/tools/toolInstallLocations.js';

/**
 * The macOS platform of a run on the fixture root: the test's catalog and tools, and no Homebrew
 * prefix, so no test reads the real ones. The apps come from the app folder of the fixture
 * environment.
 */
export function buildTestPlatform(params: {
  catalogEntries: CatalogEntry[];
  toolInstallLocations: ToolInstallLocations;
}): Platform {
  return {
    ...darwinPlatform,
    catalog: { ...darwinPlatform.catalog, entries: params.catalogEntries },
    tools: {
      ...darwinPlatform.tools,
      installLocations: params.toolInstallLocations,
      homebrewPrefixPaths: [],
    },
  };
}
