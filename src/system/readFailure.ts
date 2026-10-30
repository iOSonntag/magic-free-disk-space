import type { DirectoryFailure } from './loadDirectoryNames.js';
import type { FileContentFailure } from './loadFileBytes.js';
import type { FileFailure } from './loadFileIdentity.js';

/** A read that failed for a reason a place issue reports, with the code the system gave. */
export type ReadFailure = { reason: 'permissionDenied' | 'unexpected'; code: string };

/** Nothing is there: the path is missing, or a part of it is no folder. */
export type ReadFailureVerdictAbsent = { kind: 'absent' };

/** Something is there, but no file the reader takes: another kind, or too large. */
export type ReadFailureVerdictUnfit = { kind: 'unfit' };

export type ReadFailureVerdictFailed = { kind: 'failed'; failure: ReadFailure };

export type ReadFailureVerdict =
  | ReadFailureVerdictAbsent
  | ReadFailureVerdictUnfit
  | ReadFailureVerdictFailed;

/** The one split of every read failure into what is absent, what is unfit, and what failed. */
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
    case 'unexpected':
      return { kind: 'failed', failure: { reason: failure.reason, code: failure.code } };
  }
}
