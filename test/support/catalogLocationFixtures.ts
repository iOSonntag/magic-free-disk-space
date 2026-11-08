import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { EnvironmentLocation } from '../../src/environment/environmentLocation.js';
import { findEnvironmentLocationPath } from '../../src/environment/environmentLocation.js';
import { isSameOrInsidePath } from '../../src/path/isSameOrInsidePath.js';
import { parseAbsolutePath } from '../../src/path/parseAbsolutePath.js';

const KEBAB_CASE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The ids of the entries that another entry also holds or that are not in kebab case, each once.
 */
export function listMisnamedCatalogIds(params: { entries: CatalogEntry[] }): string[] {
  const ids = params.entries.map((entry) => entry.id);

  return [
    ...new Set(
      ids.filter((id, index) => ids.indexOf(id) !== index || !KEBAB_CASE_ID_PATTERN.test(id)),
    ),
  ];
}

/**
 * True when the location lies in the folder its root names in the environment, and a whole path is
 * absolute; a location in a known folder Windows names no path for lies nowhere. Throws, as the
 * resolver does, for a root its platform does not have.
 */
export function isLocationUnderRoot(params: {
  location: EnvironmentLocation;
  environment: Environment;
}): boolean {
  if (params.location.root === 'absolute') {
    return (
      parseAbsolutePath({ rules: params.environment.pathRules, text: params.location.path })
        .kind === 'succeeded'
    );
  }

  const rootPath = findEnvironmentLocationPath({
    folders: params.environment,
    location: { ...params.location, path: '' },
  });
  const path = findEnvironmentLocationPath({
    folders: params.environment,
    location: params.location,
  });

  return (
    rootPath !== null &&
    path !== null &&
    isSameOrInsidePath({ rules: params.environment.pathRules, path: path, parentPath: rootPath })
  );
}
