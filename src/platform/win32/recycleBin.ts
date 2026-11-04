import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { RecycleBinContent } from '../../scan/candidate.js';
import { parseDriveRoot } from './driveRoot.js';
import type { Win32CallFailure } from './win32Api.js';
import { emptyRecycleBin, loadRecycleBinCount } from './win32Api.js';

/** What a path that is no drive root fails with, before any call of the shell. */
const NOT_DRIVE_ROOT_TEXT = 'notDriveRoot';

/**
 * What the Recycle Bin of the drive at `driveRootPath` holds. A path that is no drive root, such
 * as an empty one, which the shell would take for every drive, fails before the call. A failure
 * is the HRESULT of the call as hex. Never throws.
 */
export function loadRecycleBin(params: {
  driveRootPath: AbsolutePath;
}): Result<RecycleBinContent, string> {
  const driveRoot = parseDriveRoot({ text: params.driveRootPath });

  if (driveRoot.kind === 'failed') {
    return { kind: 'failed', failure: NOT_DRIVE_ROOT_TEXT };
  }

  const count = loadRecycleBinCount({ driveRoot: driveRoot.value });

  if (count.kind === 'failed') {
    return { kind: 'failed', failure: formatShellCallFailure({ failure: count.failure }) };
  }

  return { kind: 'succeeded', value: count.value };
}

/**
 * Empties the Recycle Bin of the drive at `driveRootPath` as one unit, without asking. A path
 * that is no drive root fails before the call, so an empty root never empties every drive. A
 * failure is the HRESULT of the call as hex. Never throws.
 */
export function emptyDriveRecycleBin(params: {
  driveRootPath: AbsolutePath;
}): Result<null, string> {
  const driveRoot = parseDriveRoot({ text: params.driveRootPath });

  if (driveRoot.kind === 'failed') {
    return { kind: 'failed', failure: NOT_DRIVE_ROOT_TEXT };
  }

  const emptied = emptyRecycleBin({ driveRoot: driveRoot.value });

  if (emptied.kind === 'failed') {
    return { kind: 'failed', failure: formatShellCallFailure({ failure: emptied.failure }) };
  }

  return { kind: 'succeeded', value: null };
}

/** The HRESULT of a failed shell call as Windows writes it, such as `0x80070005`. */
export function formatShellCallFailure(params: { failure: Win32CallFailure }): string {
  return `0x${params.failure.code.toString(16).toUpperCase().padStart(8, '0')}`;
}
