import type { Result } from '../../result.js';

declare const androidAvdNameBrand: unique symbol;

/** An AVD name that `parseAndroidAvdName` checked, so it never reads as an option. */
export type AndroidAvdName = string & { [androidAvdNameBrand]: true };

// The name becomes an argument of `avdmanager delete avd -n`; avdmanager allows these characters.
const AVD_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The one maker of an `AndroidAvdName`; fails unless it starts with a letter or a digit. */
export function parseAndroidAvdName(params: { text: string }): Result<AndroidAvdName, string> {
  if (!AVD_NAME_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'not an AVD name' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as AndroidAvdName };
}
