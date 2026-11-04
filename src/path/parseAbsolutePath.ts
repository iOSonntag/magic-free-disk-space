import { posix } from 'node:path';
import type { Result } from '../result.js';
import type { PathRules } from './pathRules.js';

declare const absolutePathBrand: unique symbol;

/** A path that `parseAbsolutePath` checked: absolute, so it never reads as an option. */
export type AbsolutePath = string & { [absolutePathBrand]: true };

/** The one maker of an `AbsolutePath`; fails for a path that is not absolute under `rules`. */
export function parseAbsolutePath(params: {
  rules: PathRules;
  text: string;
}): Result<AbsolutePath, string> {
  if (!isAbsoluteUnderRules({ rules: params.rules, text: params.text })) {
    return { kind: 'failed', failure: 'not an absolute path' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as AbsolutePath };
}

function isAbsoluteUnderRules(params: { rules: PathRules; text: string }): boolean {
  switch (params.rules.rootForm) {
    case 'posix':
      return posix.isAbsolute(params.text);
  }
}
