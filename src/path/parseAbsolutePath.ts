import { isAbsolute } from 'node:path';
import type { Result } from '../result.js';

declare const absolutePathBrand: unique symbol;

/** A path that `parseAbsolutePath` checked: absolute, so it never reads as an option. */
export type AbsolutePath = string & { [absolutePathBrand]: true };

/** The one maker of an `AbsolutePath`; fails for a relative path. */
export function parseAbsolutePath(params: { text: string }): Result<AbsolutePath, string> {
  if (!isAbsolute(params.text)) {
    return { kind: 'failed', failure: 'not an absolute path' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as AbsolutePath };
}
