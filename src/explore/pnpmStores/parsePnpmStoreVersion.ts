import type { Result } from '../../result.js';

declare const pnpmStoreVersionBrand: unique symbol;

/** The name of a store folder `<store root>/v<N>` that `parsePnpmStoreVersion` checked. */
export type PnpmStoreVersion = string & { [pnpmStoreVersionBrand]: true };

const STORE_VERSION_FOLDER_PATTERN = /^v\d+$/;

/** The one maker of a `PnpmStoreVersion`; fails for any folder name but `v<N>`. */
export function parsePnpmStoreVersion(params: {
  folderName: string;
}): Result<PnpmStoreVersion, string> {
  if (!STORE_VERSION_FOLDER_PATTERN.test(params.folderName)) {
    return { kind: 'failed', failure: 'no store version folder' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.folderName as PnpmStoreVersion };
}
