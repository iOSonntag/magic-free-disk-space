import { toComparablePathText } from '../../path/isSameOrInsidePath.js';
import { resolveAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
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
 * every SDK, and names it as the state's path rules compare names, so case-blind on Windows.
 * Nothing is judged while `~/.android/avd` is absent or any AVD's image cannot be read.
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
    const namedFolderTexts = listComparableAvdImageFolderTexts({
      pathRules: state.pathRules,
      sdkRoot: sdk.sdkRoot,
      avds: state.avds,
    });

    if (namedFolderTexts === null) {
      return NOT_JUDGED;
    }

    for (const packageFolder of sdk.systemImages) {
      if (
        packageFolder.kind === 'parsed' &&
        !namedFolderTexts.has(
          toComparablePathText({ rules: state.pathRules, text: packageFolder.folderPath }),
        )
      ) {
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

/** The SDK holds no emulator. */
type AndroidSdkEmulatorOfferNone = { kind: 'none' };

/** The emulator's package could not be read, so it cannot be judged. */
type AndroidSdkEmulatorOfferNotJudged = { kind: 'notJudged' };

type AndroidSdkEmulatorOfferOffered = { kind: 'offered'; offer: AndroidPackageOffer };

type AndroidSdkEmulatorOffer =
  | AndroidSdkEmulatorOfferNone
  | AndroidSdkEmulatorOfferNotJudged
  | AndroidSdkEmulatorOfferOffered;

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

/**
 * The image folder each AVD names, resolved in the SDK, as `pathRules` compare paths; `null` when
 * one AVD's image is unknown or names no path.
 */
function listComparableAvdImageFolderTexts(params: {
  pathRules: PathRules;
  sdkRoot: AbsolutePath;
  avds: AndroidAvd[];
}): Set<string> | null {
  const folderTexts = new Set<string>();

  for (const avd of params.avds) {
    if (avd.kind !== 'present' || avd.imageSysdir === null) {
      return null;
    }

    // The resolve drops the trailing separator the SDK writes, such as `system-images/android-35/…/`.
    const folderPath = resolveAbsolutePath({
      rules: params.pathRules,
      basePath: params.sdkRoot,
      text: avd.imageSysdir,
    });

    if (folderPath.kind === 'failed') {
      return null;
    }

    folderTexts.add(toComparablePathText({ rules: params.pathRules, text: folderPath.value }));
  }

  return folderTexts;
}
