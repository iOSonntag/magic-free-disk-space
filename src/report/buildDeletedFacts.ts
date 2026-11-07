import type { RemovalOutcomeKind, RemovalRun } from '../delete/deleteCandidates.js';
import { isUnremovedOutcome } from '../delete/deleteCandidates.js';
import type { Candidate } from '../scan/candidate.js';
import type { ItemKey } from '../scan/candidateOrigin.js';
import { buildItemKey } from '../scan/candidateOrigin.js';
import { findRankedNumber } from './findRankedNumber.js';
import type { FreedSpace } from './sumFreedSpace.js';
import { sumFreedSpace } from './sumFreedSpace.js';

/** How an item ended, as a client words it; the reason key says why. */
export type DeletedOutcomeKey = 'removed' | 'partlyRemoved' | 'kept' | 'failed';

/** Why an item ended as it did; `null` for an item simply removed. */
export type DeletedReasonKey = Exclude<RemovalOutcomeKind, 'removed'>;

export type DeletedOutcomeFacts = {
  number: number;
  key: ItemKey;
  outcome: DeletedOutcomeKey;
  reasonKey: DeletedReasonKey | null;
  freedBytes: number;
};

/** What a run did, for a client to word its result by. */
export type DeletedFacts = FreedSpace & {
  outcomes: DeletedOutcomeFacts[];
  /** The free space of the home folder's volume after the run; `null` when it could not be read. */
  availableBytesAfter: number | null;
  logPath: string;
};

/** `ranked` is the candidates of the scan the run deleted from, which number its outcomes. */
export function buildDeletedFacts(params: {
  run: RemovalRun;
  ranked: Candidate[];
  availableBytesAfter: number | null;
  logPath: string;
}): DeletedFacts {
  const freedSpace = sumFreedSpace(params.run.outcomes);

  return {
    outcomes: params.run.outcomes.map((outcome) => ({
      number: findRankedNumber({ ranked: params.ranked, candidate: outcome.candidate }),
      key: buildItemKey({ item: outcome.candidate }),
      outcome: decideOutcomeKey({ kind: outcome.outcome, freedBytes: outcome.freedBytes }),
      reasonKey: outcome.outcome === 'removed' ? null : outcome.outcome,
      freedBytes: outcome.freedBytes,
    })),
    freedBytes: freedSpace.freedBytes,
    returnsLaterBytes: freedSpace.returnsLaterBytes,
    availableBytesAfter: params.availableBytesAfter,
    logPath: params.logPath,
  };
}

/**
 * `removed` for an item that went whole, as one already gone did; else `partlyRemoved` once the
 * run freed part of it, whatever kept the rest; else `failed` when a failure kept it, `kept` when
 * a check did.
 */
function decideOutcomeKey(params: {
  kind: RemovalOutcomeKind;
  freedBytes: number;
}): DeletedOutcomeKey {
  if (params.kind === 'removed' || params.kind === 'alreadyGone') {
    return 'removed';
  }

  if (params.freedBytes > 0) {
    return 'partlyRemoved';
  }

  if (isUnremovedOutcome(params.kind)) {
    return 'failed';
  }

  return 'kept';
}
