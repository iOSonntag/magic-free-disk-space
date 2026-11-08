import { toComparablePathText } from '../path/isSameOrInsidePath.js';
import { WIN32_PATH_RULES } from '../path/pathRules.js';
import type { Result } from '../result.js';
import type { CatalogLocation } from './catalog.js';

declare const macBundleIdBrand: unique symbol;

declare const windowsImageNameBrand: unique symbol;

/** The `CFBundleIdentifier` of a macOS bundle, such as `com.apple.dt.Xcode`, as `parseMacBundleId` made it. */
export type MacBundleId = string & { [macBundleIdBrand]: true };

/**
 * The file name of a Windows program, such as `msedge.exe`, as `parseWindowsImageName` made it:
 * in the form Windows compares file names by, without case.
 */
export type WindowsImageName = string & { [windowsImageNameBrand]: true };

/** A macOS app owns the data; while it runs, the entry is withheld. */
export type CatalogOwnerBundleId = { kind: 'bundleId'; bundleId: MacBundleId };

/**
 * A family of one maker's apps owns the data, such as Adobe's video apps; while any of them runs,
 * the entry is withheld. A bundle id belongs to the family when it equals a prefix or continues it
 * after a dot, so `com.adobe.ame` takes `com.adobe.ame.application.24` and never `com.adobe.amex`.
 */
export type CatalogOwnerBundleIdFamily = { kind: 'bundleIdFamily'; bundleIdPrefixes: string[] };

/**
 * A Windows program owns the data; while a process runs from its install folder or carries one of
 * its image names, the entry is withheld. `installFolder` is `null` where it moves with each
 * version, as for an app of the Microsoft Store.
 */
export type CatalogOwnerExecutable = {
  kind: 'executable';
  imageNames: [WindowsImageName, ...WindowsImageName[]];
  installFolder: CatalogLocation | null;
};

/** Who owns the data of a catalog entry, in the form its platform names an app. */
export type CatalogOwner =
  | CatalogOwnerBundleId
  | CatalogOwnerBundleIdFamily
  | CatalogOwnerExecutable;

/** Characters Windows allows in no file name. */
const windowsForbiddenNamePattern = /[\\/:*?"<>|]/;

/**
 * The one maker of a `MacBundleId`, from the text an Info.plist names. An empty id stays an id, so
 * the apps that carry it still guard what they own.
 */
export function parseMacBundleId(params: { text: string }): MacBundleId {
  // The brand marks the text as the id of a bundle, which the compiler cannot know.
  return params.text as MacBundleId;
}

/** The one maker of a `WindowsImageName`; fails for a text that is no Windows file name. */
export function parseWindowsImageName(params: {
  text: string;
}): Result<WindowsImageName, 'not a file name'> {
  if (
    params.text === '' ||
    params.text === '.' ||
    params.text === '..' ||
    windowsForbiddenNamePattern.test(params.text)
  ) {
    return { kind: 'failed', failure: 'not a file name' };
  }

  const comparableName = toComparablePathText({ rules: WIN32_PATH_RULES, text: params.text });

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: comparableName as WindowsImageName };
}
