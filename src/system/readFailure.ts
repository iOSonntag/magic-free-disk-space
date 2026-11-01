import type { DirectoryFailure } from './loadDirectoryNames.js';
import type { FileContentFailure } from './loadFileBytes.js';
import type { FileFailure } from './loadFileIdentity.js';

/**
 * A read that failed for a reason a place issue reports, with the code the system gave.
 * `privacyDenied` is macOS privacy protection, which Full Disk Access lifts; `permissionDenied`
 * is a denial by the file's own permissions.
 */
export type ReadFailure = {
  reason: 'privacyDenied' | 'permissionDenied' | 'unexpected';
  code: string;
};

/** Nothing is there: the path is missing, or a part of it is no folder. */
export type ReadFailureVerdictAbsent = { kind: 'absent' };

/** Something is there, but no file the reader takes: another kind, or too large. */
export type ReadFailureVerdictUnfit = { kind: 'unfit' };

export type ReadFailureVerdictFailed = { kind: 'failed'; failure: ReadFailure };

export type ReadFailureVerdict =
  | ReadFailureVerdictAbsent
  | ReadFailureVerdictUnfit
  | ReadFailureVerdictFailed;

/**
 * The one split of every read failure into what is absent, what is unfit, and what failed; a
 * permission failure fails as `privacyDenied` when its code is the one of macOS privacy protection.
 */
export function decideReadFailure(
  failure: FileFailure | DirectoryFailure | FileContentFailure,
): ReadFailureVerdict {
  switch (failure.reason) {
    case 'missing':
    case 'notDirectory':
      return { kind: 'absent' };
    case 'notFile':
    case 'tooLarge':
      return { kind: 'unfit' };
    case 'permissionDenied':
      return {
        kind: 'failed',
        failure: { reason: getPermissionFailureReason(failure.code), code: failure.code },
      };
    case 'unexpected':
      return { kind: 'failed', failure: { reason: 'unexpected', code: failure.code } };
  }
}

// macOS privacy protection (TCC) refuses with EPERM; a denial by the file's own mode is EACCES.
function getPermissionFailureReason(code: string): 'privacyDenied' | 'permissionDenied' {
  if (code === 'EPERM') {
    return 'privacyDenied';
  }

  return 'permissionDenied';
}
