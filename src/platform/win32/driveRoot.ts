import type { Result } from '../../result.js';

declare const driveRootBrand: unique symbol;

/** The root of one drive, such as `C:\`, made only by `parseDriveRoot`. */
export type DriveRoot = string & { [driveRootBrand]: true };

/** The text is no drive root; an empty one would make a shell call reach every drive at once. */
export type DriveRootFailure = { reason: 'notDriveRoot' };

/**
 * The one maker of a `DriveRoot`: a letter, a colon and a backslash, nothing else. The shell's
 * Recycle Bin calls take an empty or a missing root for every drive, which this refuses.
 */
export function parseDriveRoot(params: { text: string }): Result<DriveRoot, DriveRootFailure> {
  if (!/^[A-Za-z]:\\$/.test(params.text)) {
    return { kind: 'failed', failure: { reason: 'notDriveRoot' } };
  }

  // The brand records that the text passed the check above.
  return { kind: 'succeeded', value: params.text as DriveRoot };
}
