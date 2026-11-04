import type { Result } from '../result.js';

declare const macBundleIdBrand: unique symbol;

/** The `CFBundleIdentifier` of a macOS bundle, such as `com.apple.dt.Xcode`, as `parseMacBundleId` checked it. */
export type MacBundleId = string & { [macBundleIdBrand]: true };

export type CatalogOwnerNone = { kind: 'none' };

/** A macOS app owns the data; while it runs, the entry is withheld. */
export type CatalogOwnerBundleId = { kind: 'bundleId'; bundleId: MacBundleId };

/** Who owns the data of a catalog entry, in the form its platform names an app. */
export type CatalogOwner = CatalogOwnerNone | CatalogOwnerBundleId;

/** The one maker of a `MacBundleId`; fails for an empty text. */
export function parseMacBundleId(params: { text: string }): Result<MacBundleId, string> {
  if (params.text === '') {
    return { kind: 'failed', failure: 'an empty bundle id' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as MacBundleId };
}
