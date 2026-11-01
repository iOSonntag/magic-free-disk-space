import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PnpmInstallState } from './loadPnpmInstallState.js';
import type { PnpmStoreState } from './loadPnpmStoreState.js';
import { mapPnpmMajorToStoreVersion } from './mapPnpmMajorToStoreVersion.js';
import type { PnpmPins } from './parsePnpmPins.js';
import type { PnpmStoreVersion } from './parsePnpmStoreVersion.js';

/**
 * A store-version folder that no installed pnpm and no pinned pnpm uses, and that holds no global
 * virtual store.
 */
export type PnpmStoreOffer = { folderPath: AbsolutePath; storeVersion: PnpmStoreVersion };

/** An installed pnpm with the store version it uses, for the evidence of an offer. */
export type PnpmInstalledVersion = { versionText: string; storeVersion: PnpmStoreVersion };

/**
 * `isComplete` is false while a store folder is in use or its name is no store version. While a
 * project pins every store version, or an install or pin maps to none, every folder counts as used.
 */
export type PnpmStoreOffers = {
  offers: PnpmStoreOffer[];
  installedVersions: PnpmInstalledVersion[];
  isComplete: boolean;
};

type StoreVersionsInUseKnown = {
  kind: 'known';
  storeVersions: Set<PnpmStoreVersion>;
  installedVersions: PnpmInstalledVersion[];
};

type StoreVersionsInUseEvery = { kind: 'every' };

type StoreVersionsInUse = StoreVersionsInUseKnown | StoreVersionsInUseEvery;

/**
 * Offers each store folder whose version no installed or pinned pnpm uses and that holds no global
 * virtual store.
 */
export function decidePnpmStoreOffers(params: {
  storeState: PnpmStoreState;
  installState: PnpmInstallState;
  pins: PnpmPins;
}): PnpmStoreOffers {
  const inUse = decideStoreVersionsInUse({ installState: params.installState, pins: params.pins });

  if (inUse.kind === 'every') {
    const isStoreEmpty = params.storeState.folders.length === 0;

    return { offers: [], installedVersions: [], isComplete: isStoreEmpty };
  }

  const offers: PnpmStoreOffer[] = [];

  for (const folder of params.storeState.folders) {
    if (
      folder.kind === 'unparsed' ||
      inUse.storeVersions.has(folder.storeVersion) ||
      folder.hasGlobalVirtualStore
    ) {
      continue;
    }

    offers.push({ folderPath: folder.folderPath, storeVersion: folder.storeVersion });
  }

  return {
    offers: offers,
    installedVersions: inUse.installedVersions,
    isComplete: offers.length === params.storeState.folders.length,
  };
}

function decideStoreVersionsInUse(params: {
  installState: PnpmInstallState;
  pins: PnpmPins;
}): StoreVersionsInUse {
  const storeVersions = new Set<PnpmStoreVersion>();
  const installedVersions: PnpmInstalledVersion[] = [];

  for (const install of params.installState.installs) {
    if (install.kind === 'unparsed') {
      return { kind: 'every' };
    }

    const storeVersion = mapPnpmMajorToStoreVersion({ major: install.major });

    if (storeVersion === null) {
      return { kind: 'every' };
    }

    storeVersions.add(storeVersion);
    const isListed = installedVersions.some(
      (installed) => installed.versionText === install.versionText,
    );

    if (!isListed) {
      installedVersions.push({ versionText: install.versionText, storeVersion: storeVersion });
    }
  }

  if (params.pins.kind === 'everyStoreVersion') {
    return { kind: 'every' };
  }

  for (const major of params.pins.majors) {
    const storeVersion = mapPnpmMajorToStoreVersion({ major: major });

    if (storeVersion === null) {
      return { kind: 'every' };
    }

    storeVersions.add(storeVersion);
  }

  return { kind: 'known', storeVersions: storeVersions, installedVersions: installedVersions };
}
