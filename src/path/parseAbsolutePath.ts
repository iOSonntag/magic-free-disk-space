import { posix, win32 } from 'node:path';
import type { Result } from '../result.js';
import type { PathRules } from './pathRules.js';

declare const absolutePathBrand: unique symbol;

/** A path that `parseAbsolutePath` checked: absolute, so it never reads as an option. */
export type AbsolutePath = string & { [absolutePathBrand]: true };

/**
 * The code of a failed read whose real path `parseAbsolutePath` refuses under the rules of the run,
 * as a network share is no drive path of Windows.
 */
export const NOT_ABSOLUTE_CODE = 'notAbsolute';

/** A Windows path rooted at a drive letter, such as `C:\` or `c:/`. */
const win32DriveRootPattern = /^[A-Za-z]:[\\/]/;

/**
 * The one maker of an `AbsolutePath`; fails for a path that is not absolute under `rules`, and for
 * one that holds a NUL character. A POSIX path is taken as it is. A Windows path must start at a
 * drive letter, so a share (`\\server\x`), a device path (`\\?\`, `\\.\`), a path relative to a
 * drive (`C:x`), and one rooted without a drive (`\x`) fail; it is normalized to `\` separators
 * without `.` and `..`, and its drive letter upper-cased.
 */
export function parseAbsolutePath(params: {
  rules: PathRules;
  text: string;
}): Result<AbsolutePath, 'not an absolute path'> {
  // A Win32 call reads a path up to its first NUL, so it would reach a shorter path than the one
  // every check judged.
  if (params.text.includes('\0')) {
    return { kind: 'failed', failure: 'not an absolute path' };
  }

  const pathText = parseUnderRules({ rules: params.rules, text: params.text });

  if (pathText === null) {
    return { kind: 'failed', failure: 'not an absolute path' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: pathText as AbsolutePath };
}

function parseUnderRules(params: { rules: PathRules; text: string }): string | null {
  switch (params.rules.rootForm) {
    case 'posix':
      return posix.isAbsolute(params.text) ? params.text : null;
    case 'win32':
      return parseWin32DrivePath({ text: params.text });
  }
}

function parseWin32DrivePath(params: { text: string }): string | null {
  if (!win32DriveRootPattern.test(params.text)) {
    return null;
  }

  const normalizedText = win32.normalize(params.text);

  return `${normalizedText.charAt(0).toUpperCase()}${normalizedText.slice(1)}`;
}
