import type { ReadFailureVerdict } from './readFailure.js';

/** Whether macOS lets this process into the folders that privacy protection guards. */
export type FullDiskAccess = 'granted' | 'denied' | 'unknown';

/**
 * What a probe open that failed with this verdict says about Full Disk Access. Only a privacy
 * denial is an answer of macOS privacy protection; any other failure, such as a POSIX denial,
 * decides nothing.
 */
export function readFailureVerdictToFullDiskAccess(verdict: ReadFailureVerdict): FullDiskAccess {
  switch (verdict.kind) {
    case 'absent':
    case 'unfit':
      return 'unknown';
    case 'failed':
      return verdict.failure.reason === 'privacyDenied' ? 'denied' : 'unknown';
  }
}
