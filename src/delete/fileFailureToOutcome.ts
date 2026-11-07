import type { FileFailure } from '../system/loadFileIdentity.js';
import type { RemovalOutcomeCodedKind } from './deleteCandidates.js';

/**
 * What a failed read of a target right before its removal makes of it: a missing target is
 * `alreadyGone`, a denied one `permissionDenied`, any other `failed`, the last two with the code.
 */
export function fileFailureToOutcome(failure: FileFailure): {
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
} {
  switch (failure.reason) {
    case 'missing':
      return { outcome: 'alreadyGone', code: null };
    case 'permissionDenied':
      return { outcome: 'permissionDenied', code: failure.code };
    case 'unexpected':
      return { outcome: 'failed', code: failure.code };
  }
}
