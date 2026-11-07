import { join } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';

/**
 * The absolute path of an entry: its path as is, or joined below the home, the temp, or the user
 * cache folder.
 */
export function getCatalogEntryPath(params: {
  environment: Environment;
  entry: CatalogEntry;
}): string {
  switch (params.entry.root) {
    case 'home':
      return join(params.environment.homeDir, params.entry.path);
    case 'temp':
      return join(params.environment.tempDir, params.entry.path);
    case 'userCache':
      return join(params.environment.userCacheDir, params.entry.path);
    case 'absolute':
      return params.entry.path;
  }
}
