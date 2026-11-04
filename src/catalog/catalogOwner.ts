declare const macBundleIdBrand: unique symbol;

/** The `CFBundleIdentifier` of a macOS bundle, such as `com.apple.dt.Xcode`, as `parseMacBundleId` made it. */
export type MacBundleId = string & { [macBundleIdBrand]: true };

/** A macOS app owns the data; while it runs, the entry is withheld. */
export type CatalogOwnerBundleId = { kind: 'bundleId'; bundleId: MacBundleId };

/** Who owns the data of a catalog entry, in the form its platform names an app. */
export type CatalogOwner = CatalogOwnerBundleId;

/**
 * The one maker of a `MacBundleId`, from the text an Info.plist names. An empty id stays an id, so
 * the apps that carry it still guard what they own.
 */
export function parseMacBundleId(params: { text: string }): MacBundleId {
  // The brand marks the text as the id of a bundle, which the compiler cannot know.
  return params.text as MacBundleId;
}
