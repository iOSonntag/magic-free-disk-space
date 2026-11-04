import type { CatalogEntry } from '../../src/catalog/catalog.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { Platform } from '../../src/platform/platform.js';
import type { ToolInstallLocations } from '../../src/tools/toolInstallLocations.js';
import type { FixtureRoot } from './fixtureRoot.js';

/**
 * The macOS platform of a run on the fixture root: the test's catalog and tools, the apps of the
 * fixture's app folder, and no Homebrew prefix, so no test reads the real ones.
 */
export function buildTestPlatform(params: {
  fixtureRoot: FixtureRoot;
  catalogEntries: CatalogEntry[];
  toolInstallLocations: ToolInstallLocations;
}): Platform {
  return {
    ...darwinPlatform,
    catalog: {
      ...darwinPlatform.catalog,
      entries: params.catalogEntries,
      applicationDirs: [{ root: 'absolute', path: params.fixtureRoot.applicationDir }],
    },
    tools: {
      ...darwinPlatform.tools,
      installLocations: params.toolInstallLocations,
      homebrewPrefixPaths: [],
    },
  };
}
