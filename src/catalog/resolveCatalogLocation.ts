import type { Environment } from '../environment/buildEnvironment.js';
import { resolveEnvironmentLocation } from '../environment/environmentLocation.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { CatalogLocation } from './catalog.js';

/**
 * The absolute path of a location in the run's environment, as `resolveEnvironmentLocation`
 * resolves it below the paths of the run's folders, with its throws.
 */
export function resolveCatalogLocation(params: {
  environment: Environment;
  location: CatalogLocation;
}): AbsolutePath {
  return resolveEnvironmentLocation({ folders: params.environment, location: params.location });
}
