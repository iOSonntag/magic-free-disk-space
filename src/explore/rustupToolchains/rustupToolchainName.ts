import type { Result } from '../../result.js';

declare const rustupToolchainNameBrand: unique symbol;

/** A toolchain name `rustup toolchain list` gave, checked so it never reads as an option. */
export type RustupToolchainName = string & { [rustupToolchainNameBrand]: true };

// Such as `stable-aarch64-apple-darwin` or `nightly-2024-01-01-aarch64-apple-darwin`.
const RUSTUP_TOOLCHAIN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/** Fails for a name that could start an option or holds a path separator or a space. */
export function parseRustupToolchainName(params: {
  text: string;
}): Result<RustupToolchainName, string> {
  if (!RUSTUP_TOOLCHAIN_NAME_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'not a toolchain name' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as RustupToolchainName };
}
