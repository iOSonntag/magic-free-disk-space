import type { Candidate, CandidateRemovalEmptyRecycleBin } from '../scan/candidate.js';
import type { SystemCallFailure } from '../system/systemCallFailure.js';
import { formatSystemCallCode } from '../system/systemCallFailure.js';
import { decideRecycleBinRecheck } from './decideRecycleBinRecheck.js';
import type { RecordedRemoval, RemovalOutcomeCodedKind } from './deleteCandidates.js';
import type { DeletePlatformTrash, DeletePlatformTrashRecycleBins } from './deletePlatform.js';

/** What emptying the bin made of it, with the code of a failed count or emptying. */
type RecycleBinEmptying = { outcome: RemovalOutcomeCodedKind; code: string | null };

/**
 * Empties the Recycle Bin of the drive only while a fresh count still finds what the scan
 * counted; anything thrown away since would go unseen. The system empties the bin as one unit,
 * which frees its scanned size; one entry at the bin's path.
 */
export function emptyRecycleBinCandidate(params: {
  candidate: Candidate;
  removal: CandidateRemovalEmptyRecycleBin;
  trash: DeletePlatformTrash;
  clock: () => number;
}): RecordedRemoval {
  const emptying = emptyScannedRecycleBin({ removal: params.removal, trash: params.trash });

  return {
    outcome: {
      candidate: params.candidate,
      freedBytes: emptying.outcome === 'removed' ? params.candidate.allocatedBytes : 0,
      outcome: emptying.outcome,
      code: emptying.code,
    },
    outcomeEntries: [
      {
        kind: 'outcome',
        atMs: params.clock(),
        path: params.candidate.path,
        outcome: emptying.outcome,
        code: emptying.code,
      },
    ],
  };
}

function emptyScannedRecycleBin(params: {
  removal: CandidateRemovalEmptyRecycleBin;
  trash: DeletePlatformTrash;
}): RecycleBinEmptying {
  switch (params.trash.kind) {
    // A platform whose trash is a folder has no Recycle Bin to empty.
    case 'catalogFolder':
      return { outcome: 'failed', code: null };
    case 'recycleBins':
      return emptyUnchangedRecycleBin({ removal: params.removal, trash: params.trash });
  }
}

function emptyUnchangedRecycleBin(params: {
  removal: CandidateRemovalEmptyRecycleBin;
  trash: DeletePlatformTrashRecycleBins;
}): RecycleBinEmptying {
  const current = params.trash.loadRecycleBin({ driveRoot: params.removal.driveRoot });

  if (current.kind === 'failed') {
    return buildFailedEmptying({ failure: current.failure });
  }

  const recheck = decideRecycleBinRecheck({
    scanned: params.removal.scannedContent,
    current: current.value,
  });

  switch (recheck) {
    case 'alreadyGone':
    case 'changedSinceScan':
      return { outcome: recheck, code: null };
    case 'unchanged':
      return emptyRecheckedRecycleBin({ removal: params.removal, trash: params.trash });
  }
}

/**
 * Empties a bin the fresh count found unchanged. A failure that tells the bin held nothing is
 * `alreadyGone` once a second count finds the bin empty, as when another program emptied it since
 * the fresh count; any other failure stands with its code.
 */
function emptyRecheckedRecycleBin(params: {
  removal: CandidateRemovalEmptyRecycleBin;
  trash: DeletePlatformTrashRecycleBins;
}): RecycleBinEmptying {
  const emptied = params.trash.emptyRecycleBin({ driveRoot: params.removal.driveRoot });

  if (emptied.kind === 'succeeded') {
    return { outcome: 'removed', code: null };
  }

  if (emptied.failure.code !== params.trash.nothingToEmptyCode) {
    return buildFailedEmptying({ failure: emptied.failure });
  }

  const after = params.trash.loadRecycleBin({ driveRoot: params.removal.driveRoot });

  if (after.kind === 'failed') {
    return buildFailedEmptying({ failure: emptied.failure });
  }

  const recheck = decideRecycleBinRecheck({
    scanned: params.removal.scannedContent,
    current: after.value,
  });

  switch (recheck) {
    case 'alreadyGone':
      return { outcome: 'alreadyGone', code: null };
    // The bin still holds items, so the emptying failed for a reason of its own.
    case 'changedSinceScan':
    case 'unchanged':
      return buildFailedEmptying({ failure: emptied.failure });
  }
}

/** The failed call as the outcome's code, written as the system writes its codes. */
function buildFailedEmptying(params: { failure: SystemCallFailure }): RecycleBinEmptying {
  return { outcome: 'failed', code: formatSystemCallCode({ code: params.failure.code }) };
}
