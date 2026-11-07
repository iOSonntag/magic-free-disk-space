import type { RemovalOutcomeKind } from './deleteCandidates.js';

/** Whether the outcome leaves its item gone from the disk, by this run or before it. */
export function isGoneOutcome(kind: RemovalOutcomeKind): boolean {
  switch (kind) {
    case 'removed':
    case 'alreadyGone':
      return true;
    case 'changedSinceScan':
    case 'ownerRunning':
    case 'permissionDenied':
    case 'failed':
    case 'notAttempted':
    case 'toolFailed':
    case 'engineInUse':
    case 'engineNotRunning':
      return false;
  }
}
