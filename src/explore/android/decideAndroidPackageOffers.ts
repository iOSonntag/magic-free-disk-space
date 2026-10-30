import { resolve } from 'node:path';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { AndroidAvd, AndroidSdkState } from './loadAndroidSdkState.js';

/** A package folder of the SDK that a probe offers, with the id its `package.xml` names. */
export type AndroidPackageOffer = {
  sdkRoot: AbsolutePath;
  folderPath: AbsolutePath;
  packagePath: string;
};

/** What a package probe offers; `isComplete` is false when it could not judge some folders. */
export type AndroidPackageOffers = { offers: AndroidPackageOffer[]; isComplete: boolean };

const NOTHING_TO_OFFER: AndroidPackageOffers = { offers: [], isComplete: true };

const NOT_JUDGED: AndroidPackageOffers = { offers: [], isComplete: false };

/**
 * The system image folders that no AVD's `image.sysdir.1` names, at the scan and at the recheck
 * alike. Nothing is judged while `~/.android/avd` is absent or any AVD's image cannot be read.
 */
export function decideAndroidSystemImageOffers(state: AndroidSdkState): AndroidPackageOffers {
  if (state.sdk === null) {
    return NOTHING_TO_OFFER;
  }

  if (state.avds === null) {
    return NOT_JUDGED;
  }

  const sdkRoot = state.sdk.sdkRoot;
  const namedFolderPaths = listAndroidAvdImageFolderPaths({ sdkRoot: sdkRoot, avds: state.avds });

  if (namedFolderPaths === null) {
    return NOT_JUDGED;
  }

  const offers: AndroidPackageOffer[] = [];

  for (const packageFolder of state.sdk.systemImages) {
    if (packageFolder.kind === 'parsed' && !namedFolderPaths.has(packageFolder.folderPath)) {
      offers.push({
        sdkRoot: sdkRoot,
        folderPath: packageFolder.folderPath,
        packagePath: packageFolder.packagePath,
      });
    }
  }

  return {
    offers: offers,
    isComplete: state.sdk.systemImages.every((packageFolder) => packageFolder.kind === 'parsed'),
  };
}

/**
 * The emulator package while `~/.android/avd` holds no `*.ini`, at the scan and at the recheck
 * alike. An AVD counts whether or not it could be read, since it still exists.
 */
export function decideAndroidEmulatorOffers(state: AndroidSdkState): AndroidPackageOffers {
  if (state.sdk === null) {
    return NOTHING_TO_OFFER;
  }

  if (state.avds === null) {
    return NOT_JUDGED;
  }

  if (state.avds.length > 0 || state.sdk.emulator === null) {
    return NOTHING_TO_OFFER;
  }

  switch (state.sdk.emulator.kind) {
    case 'unparsed':
      return NOT_JUDGED;
    case 'parsed':
      return {
        offers: [
          {
            sdkRoot: state.sdk.sdkRoot,
            folderPath: state.sdk.emulator.folderPath,
            packagePath: state.sdk.emulator.packagePath,
          },
        ],
        isComplete: true,
      };
  }
}

/** The image folder each AVD names, resolved in the SDK; `null` when one AVD's image is unknown. */
function listAndroidAvdImageFolderPaths(params: {
  sdkRoot: AbsolutePath;
  avds: AndroidAvd[];
}): Set<string> | null {
  const folderPaths = new Set<string>();

  for (const avd of params.avds) {
    if (avd.kind !== 'present' || avd.imageSysdir === null) {
      return null;
    }

    // `resolve` drops the trailing slash the SDK writes, such as `system-images/android-35/…/`.
    folderPaths.add(resolve(params.sdkRoot, avd.imageSysdir));
  }

  return folderPaths;
}
