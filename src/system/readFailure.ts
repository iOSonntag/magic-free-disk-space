import type { DirectoryFailure } from './loadDirectoryNames.js';
import type { FileContentFailure } from './loadFileBytes.js';
import type { FileFailure } from './loadFileIdentity.js';

/**
 * A read that failed for a reason a place issue reports, with the code the system gave.
 * `privacyDenied` is the platform's privacy protection, which Full Disk Access lifts on macOS;
 * `permissionDenied` is a denial by the file's own permissions.
 */
export type ReadFailure = {
  /** `inUse` is another program holding the entry open. */
  reason: 'privacyDenied' | 'permissionDenied' | 'inUse' | 'unexpected';
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
 * permission failure fails as `privacyDenied` when its code is `privacyDenialCode`, and no code
 * is one when that is `null`.
 */
export function decideReadFailure(params: {
  failure: FileFailure | DirectoryFailure | FileContentFailure;
  privacyDenialCode: string | null;
}): ReadFailureVerdict {
  switch (params.failure.reason) {
    case 'missing':
    case 'notDirectory':
      return { kind: 'absent' };
    case 'notFile':
    case 'tooLarge':
      return { kind: 'unfit' };
    case 'permissionDenied':
      return {
        kind: 'failed',
        failure: {
          reason: getPermissionFailureReason({
            code: params.failure.code,
            privacyDenialCode: params.privacyDenialCode,
          }),
          code: params.failure.code,
        },
      };
    case 'inUse':
      return { kind: 'failed', failure: { reason: 'inUse', code: params.failure.code } };
    case 'unexpected':
      return { kind: 'failed', failure: { reason: 'unexpected', code: params.failure.code } };
  }
}

function getPermissionFailureReason(params: {
  code: string;
  privacyDenialCode: string | null;
}): 'privacyDenied' | 'permissionDenied' {
  if (params.code === params.privacyDenialCode) {
    return 'privacyDenied';
  }

  return 'permissionDenied';
}
