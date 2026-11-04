import type { AppDataDirs, Environment } from '../environment/buildEnvironment.js';
import { joinAbsolutePath } from '../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../path/parseAbsolutePath.js';
import type { CatalogLocation } from './catalog.js';

/**
 * The absolute path of a location in the run's environment: its path whole for `absolute`, else
 * its names joined below the root folder. Throws for a `userCache` or AppData root on a platform
 * without that folder, a whole path that is not absolute, and a name that is no entry, each a bug
 * of the platform's data.
 */
export function resolveCatalogLocation(params: {
  environment: Environment;
  location: CatalogLocation;
}): AbsolutePath {
  switch (params.location.root) {
    case 'absolute':
      return parseWholePath({ environment: params.environment, text: params.location.path });
    case 'home':
      return joinBelowRoot({
        environment: params.environment,
        rootDir: params.environment.homeDir,
        path: params.location.path,
      });
    case 'temp':
      return joinBelowRoot({
        environment: params.environment,
        rootDir: params.environment.tempDir,
        path: params.location.path,
      });
    case 'userCache':
      return joinBelowRoot({
        environment: params.environment,
        rootDir: requireUserCacheDir({ environment: params.environment }),
        path: params.location.path,
      });
    case 'localAppData':
      return joinBelowRoot({
        environment: params.environment,
        rootDir: requireAppDataDirs({ environment: params.environment }).localDir,
        path: params.location.path,
      });
    case 'roamingAppData':
      return joinBelowRoot({
        environment: params.environment,
        rootDir: requireAppDataDirs({ environment: params.environment }).roamingDir,
        path: params.location.path,
      });
  }
}

function parseWholePath(params: { environment: Environment; text: string }): AbsolutePath {
  const path = parseAbsolutePath({ rules: params.environment.pathRules, text: params.text });

  if (path.kind === 'failed') {
    throw new Error(`The catalog path ${params.text} is not absolute.`);
  }

  return path.value;
}

function joinBelowRoot(params: {
  environment: Environment;
  rootDir: AbsolutePath;
  path: string;
}): AbsolutePath {
  return joinAbsolutePath({
    rules: params.environment.pathRules,
    parentPath: params.rootDir,
    names: params.path === '' ? [] : params.path.split('/'),
  });
}

function requireUserCacheDir(params: { environment: Environment }): AbsolutePath {
  if (params.environment.userCacheDir === null) {
    throw new Error('A catalog location lies below the user cache on a platform without one.');
  }

  return params.environment.userCacheDir;
}

function requireAppDataDirs(params: { environment: Environment }): AppDataDirs {
  if (params.environment.appDataDirs === null) {
    throw new Error('A catalog location lies below AppData on a platform without AppData folders.');
  }

  return params.environment.appDataDirs;
}
