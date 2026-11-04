/** The 26 drive letters, bit 0 of `GetLogicalDrives` for `A`. */
const DRIVE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The root of each drive whose bit the mask of `GetLogicalDrives` sets, as `C:\`, in letter order. */
export function listDriveRootTexts(params: { logicalDrives: number }): string[] {
  return [...DRIVE_LETTERS].flatMap((letter, index) =>
    (params.logicalDrives & (1 << index)) === 0 ? [] : [`${letter}:\\`],
  );
}
