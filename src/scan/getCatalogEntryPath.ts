import { join } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';

/** The absolute path of an entry: its path as is, or joined below the home or the temp folder. */
export function getCatalogEntryPath(params: {
  environment: Environment;
  entry: CatalogEntry;
}): string {
  if (params.entry.root === 'absolute') {
    return params.entry.path;
  }

  const rootDir =
    params.entry.root === 'home' ? params.environment.homeDir : params.environment.tempDir;

  return join(rootDir, params.entry.path);
}
