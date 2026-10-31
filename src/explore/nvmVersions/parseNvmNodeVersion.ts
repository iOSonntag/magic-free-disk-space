import type { Result } from '../../result.js';

declare const nvmNodeVersionBrand: unique symbol;

/** The name of a folder `~/.nvm/versions/node/v<x.y.z>` that `parseNvmNodeVersion` checked. */
export type NvmNodeVersion = string & { [nvmNodeVersionBrand]: true };

const VERSION_FOLDER_PATTERN = /^v\d+\.\d+\.\d+$/;

/** The one maker of an `NvmNodeVersion`; fails for any folder name but `v<x.y.z>`. */
export function parseNvmNodeVersion(params: {
  folderName: string;
}): Result<NvmNodeVersion, string> {
  if (!VERSION_FOLDER_PATTERN.test(params.folderName)) {
    return { kind: 'failed', failure: 'no version folder' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.folderName as NvmNodeVersion };
}

/** The dotted digits of a version without its `v`, `22.11.0` for `v22.11.0`. */
export function nvmNodeVersionToDottedVersion(version: NvmNodeVersion): string {
  return version.slice(1);
}
