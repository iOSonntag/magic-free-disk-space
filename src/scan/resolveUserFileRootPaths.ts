import { resolveCatalogLocation } from '../catalog/resolveCatalogLocation.js';
import type { Environment, WindowsKnownFolder } from '../environment/buildEnvironment.js';
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
  return params.roots.flatMap((root) =>
    resolveUserFileRootPath({ environment: params.environment, root: root }),
  );
}

/** The path of the root as a list: empty for a known folder Windows names no path for. */
function resolveUserFileRootPath(params: {
  environment: Environment;
  root: UserFileRoot;
}): AbsolutePath[] {
  switch (params.root.kind) {
    case 'location':
      return [
        resolveCatalogLocation({ environment: params.environment, location: params.root.location }),
      ];
    case 'knownFolder': {
      const path = findKnownFolderPath({
        environment: params.environment,
        folder: params.root.folder,
      });

      return path === null ? [] : [path];
    }
  }
}

function findKnownFolderPath(params: {
  environment: Environment;
  folder: WindowsKnownFolder;
}): AbsolutePath | null {
  if (params.environment.knownFolderPaths === null) {
    throw new Error('A user-file root is a known folder on a platform without known folders.');
  }

  return params.environment.knownFolderPaths[params.folder];
}
