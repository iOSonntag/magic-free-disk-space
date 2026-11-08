import type { Environment } from '../environment/buildEnvironment.js';
import type { EnvironmentLocation } from '../environment/environmentLocation.js';
import { findEnvironmentLocationPath } from '../environment/environmentLocation.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';

/**
 * The paths of the user-file roots in the run's environment, in their order. A known folder
 * Windows names no path for is left out. Throws for a known folder on a platform without known
 * folders, a bug of the platform's data.
 */
export function resolveUserFileRootPaths(params: {
  environment: Environment;
  roots: EnvironmentLocation[];
}): AbsolutePath[] {
  return params.roots.flatMap((root) => {
    const path = findEnvironmentLocationPath({ folders: params.environment, location: root });

    return path === null ? [] : [path];
  });
}
