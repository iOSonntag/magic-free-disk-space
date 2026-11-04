import type { CatalogLocation } from '../../src/catalog/catalog.js';
import { resolveCatalogLocation } from '../../src/catalog/resolveCatalogLocation.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { isSameOrInsidePath } from '../../src/path/isSameOrInsidePath.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../src/path/parseAbsolutePath.js';

/**
 * True when the location lies in the folder its root names in the environment, and a whole path is
 * absolute; a `userCache` or AppData root lies nowhere on a platform without that folder.
 */
export function isLocationUnderRoot(params: {
  location: CatalogLocation;
  environment: Environment;
}): boolean {
  const userCacheDir = params.environment.userCacheDir;
  const appDataDirs = params.environment.appDataDirs;

  switch (params.location.root) {
    case 'home':
      return isResolvedUnder({ ...params, rootDir: params.environment.homeDir });
    case 'temp':
      return isResolvedUnder({ ...params, rootDir: params.environment.tempDir });
    case 'userCache':
      return userCacheDir !== null && isResolvedUnder({ ...params, rootDir: userCacheDir });
    case 'localAppData':
      return appDataDirs !== null && isResolvedUnder({ ...params, rootDir: appDataDirs.localDir });
    case 'roamingAppData':
      return (
        appDataDirs !== null && isResolvedUnder({ ...params, rootDir: appDataDirs.roamingDir })
      );
    case 'absolute':
      return (
        parseAbsolutePath({ rules: params.environment.pathRules, text: params.location.path })
          .kind === 'succeeded'
      );
  }
}

function isResolvedUnder(params: {
  location: CatalogLocation;
  environment: Environment;
  rootDir: AbsolutePath;
}): boolean {
  return isSameOrInsidePath({
    rules: params.environment.pathRules,
    path: resolveCatalogLocation({ environment: params.environment, location: params.location }),
    parentPath: params.rootDir,
  });
}
