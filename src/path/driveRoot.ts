import type { Result } from '../result.js';
import type { AbsolutePath } from './parseAbsolutePath.js';
import { parseAbsolutePath } from './parseAbsolutePath.js';
import type { PathRules } from './pathRules.js';

declare const driveRootBrand: unique symbol;

/** The root of one drive of Windows, such as `C:\`, made only by `parseDriveRoot`. */
export type DriveRoot = AbsolutePath & { [driveRootBrand]: true };

/** A drive letter, a colon and a backslash, nothing before or after. */
const DRIVE_ROOT_PATTERN = /^[A-Za-z]:\\$/;

/**
 * The one maker of a `DriveRoot`: a letter, a colon and a backslash under the Windows rules, the
 * letter upper-cased as in every absolute path. It fails for an empty root, which a shell call of
 * the Recycle Bin takes for every drive, and under the POSIX rules, whose file system has no drive.
 */
export function parseDriveRoot(params: {
  rules: PathRules;
  text: string;
}): Result<DriveRoot, 'not a drive root'> {
  switch (params.rules.rootForm) {
    case 'posix':
      return { kind: 'failed', failure: 'not a drive root' };
    case 'win32': {
      if (!DRIVE_ROOT_PATTERN.test(params.text)) {
        return { kind: 'failed', failure: 'not a drive root' };
      }

      const path = parseAbsolutePath({ rules: params.rules, text: params.text });

      if (path.kind === 'failed') {
        return { kind: 'failed', failure: 'not a drive root' };
      }

      // The brand records the check of the pattern above, which the compiler cannot follow.
      return { kind: 'succeeded', value: path.value as DriveRoot };
    }
  }
}
