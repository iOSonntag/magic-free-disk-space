import { resolve } from 'node:path';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { AndroidAvd, AndroidSdk, AndroidSdkState } from './loadAndroidSdkState.js';

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
 * alike. An AVD names its image relative to an SDK it does not record, so it names that image in
 * every SDK. Nothing is judged while `~/.android/avd` is absent or any AVD's image cannot be read.
 */
export function decideAndroidSystemImageOffers(state: AndroidSdkState): AndroidPackageOffers {
  if (state.sdks.length === 0) {
    return NOTHING_TO_OFFER;
  }

  if (state.avds === null) {
    return NOT_JUDGED;
  }

  const offers: AndroidPackageOffer[] = [];

  for (const sdk of state.sdks) {
    const namedFolderPaths = listAndroidAvdImageFolderPaths({
      sdkRoot: sdk.sdkRoot,
      avds: state.avds,
    });

    if (namedFolderPaths === null) {
      return NOT_JUDGED;
    }

    for (const packageFolder of sdk.systemImages) {
      if (packageFolder.kind === 'parsed' && !namedFolderPaths.has(packageFolder.folderPath)) {
        offers.push({
          sdkRoot: sdk.sdkRoot,
          folderPath: packageFolder.folderPath,
          packagePath: packageFolder.packagePath,
        });
      }
    }
  }

  return {
    offers: offers,
    isComplete: state.sdks.every((sdk) =>
      sdk.systemImages.every((packageFolder) => packageFolder.kind === 'parsed'),
    ),
  };
}

/**
 * The emulator package of each SDK while `~/.android/avd` holds no `*.ini`, at the scan and at the
 * recheck alike. An AVD counts whether or not it could be read, since it still exists.
 */
export function decideAndroidEmulatorOffers(state: AndroidSdkState): AndroidPackageOffers {
  if (state.sdks.length === 0) {
    return NOTHING_TO_OFFER;
  }

  if (state.avds === null) {
    return NOT_JUDGED;
  }

  if (state.avds.length > 0) {
    return NOTHING_TO_OFFER;
  }

  const offers: AndroidPackageOffer[] = [];
  let isComplete = true;

  for (const sdk of state.sdks) {
    const offer = decideAndroidSdkEmulatorOffer({ sdk: sdk });

    switch (offer.kind) {
      case 'none':
        break;
      case 'notJudged':
        isComplete = false;
        break;
      case 'offered':
        offers.push(offer.offer);
        break;
    }
  }

  return { offers: offers, isComplete: isComplete };
}

type AndroidSdkEmulatorOffer =
  | { kind: 'none' }
  | { kind: 'notJudged' }
  | { kind: 'offered'; offer: AndroidPackageOffer };

function decideAndroidSdkEmulatorOffer(params: { sdk: AndroidSdk }): AndroidSdkEmulatorOffer {
  if (params.sdk.emulator === null) {
    return { kind: 'none' };
  }

  switch (params.sdk.emulator.kind) {
    case 'unparsed':
      return { kind: 'notJudged' };
    case 'parsed':
      return {
        kind: 'offered',
        offer: {
          sdkRoot: params.sdk.sdkRoot,
          folderPath: params.sdk.emulator.folderPath,
          packagePath: params.sdk.emulator.packagePath,
        },
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
