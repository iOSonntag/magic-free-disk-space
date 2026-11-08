import type { Environment } from '../environment/buildEnvironment.js';
import type { EnvironmentLocation } from '../environment/environmentLocation.js';
import { findEnvironmentLocationPath } from '../environment/environmentLocation.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { UserFileRoot } from './scanPlatform.js';

/**
 * The paths of the user-file roots in the run's environment, in their order. A known folder
 * Windows names no path for is left out. Throws for a known folder on a platform without known
 * folders, a bug of the platform's data.
 */
export function resolveUserFileRootPaths(params: {
  environment: Environment;
  roots: UserFileRoot[];
}): AbsolutePath[] {
  return params.roots.flatMap((root) => {
    const path = findEnvironmentLocationPath({
      folders: params.environment,
      location: toEnvironmentLocation({ root: root }),
    });

    return path === null ? [] : [path];
  });
}

function toEnvironmentLocation(params: { root: UserFileRoot }): EnvironmentLocation {
  switch (params.root.kind) {
    case 'location':
      return params.root.location;
    case 'knownFolder':
      return { root: 'knownFolder', folder: params.root.folder, path: '' };
  }
}
