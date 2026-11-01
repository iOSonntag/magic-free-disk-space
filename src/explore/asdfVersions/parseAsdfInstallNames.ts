import type { Result } from '../../result.js';

declare const asdfToolNameBrand: unique symbol;

declare const asdfToolVersionBrand: unique symbol;

/** The name of a folder `~/.asdf/installs/<tool>` that `parseAsdfToolName` checked. */
export type AsdfToolName = string & { [asdfToolNameBrand]: true };

/** The name of a folder `~/.asdf/installs/<tool>/<version>` that `parseAsdfToolVersion` checked. */
export type AsdfToolVersion = string & { [asdfToolVersionBrand]: true };

// Both become arguments of `asdf uninstall`, so neither may start an option.
const TOOL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/** The one maker of an `AsdfToolName`; fails for a folder name that could start an option. */
export function parseAsdfToolName(params: { folderName: string }): Result<AsdfToolName, string> {
  if (!TOOL_NAME_PATTERN.test(params.folderName)) {
    return { kind: 'failed', failure: 'a malformed tool name' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.folderName as AsdfToolName };
}

/** The one maker of an `AsdfToolVersion`; fails for a folder name that could start an option. */
export function parseAsdfToolVersion(params: {
  folderName: string;
}): Result<AsdfToolVersion, string> {
  if (!VERSION_PATTERN.test(params.folderName)) {
    return { kind: 'failed', failure: 'a malformed version' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.folderName as AsdfToolVersion };
}
