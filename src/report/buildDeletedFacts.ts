import type { RemovalOutcomeKind, RemovalRun } from '../delete/deleteCandidates.js';
import type { Candidate } from '../scan/candidate.js';
import type { ItemKey } from '../scan/candidateOrigin.js';
import { buildItemKey } from '../scan/candidateOrigin.js';
import { findRankedNumber } from './findRankedNumber.js';

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
export type DeletedFacts = {
  outcomes: DeletedOutcomeFacts[];
  freedBytes: number;
  /** Space that comes back later, once a tool or the system gives it up; none so far. */
  returnsLaterBytes: number;
  /** The free space of the home folder's volume after the run; `null` when it could not be read. */
  availableBytesAfter: number | null;
  logPath: string;
};

/** `unremoved` turns `partlyRemoved` when the run freed some of the item, else `failed`. */
type OutcomeClass = 'removed' | 'kept' | 'unremoved';

const outcomeClasses: Record<RemovalOutcomeKind, OutcomeClass> = {
  removed: 'removed',
  alreadyGone: 'removed',
  changedSinceScan: 'kept',
  ownerRunning: 'kept',
  notAttempted: 'kept',
  permissionDenied: 'unremoved',
  failed: 'unremoved',
  toolFailed: 'unremoved',
};

/** `ranked` is the candidates of the scan the run deleted from, which number its outcomes. */
export function buildDeletedFacts(params: {
  run: RemovalRun;
  ranked: Candidate[];
  availableBytesAfter: number | null;
  logPath: string;
}): DeletedFacts {
  return {
    outcomes: params.run.outcomes.map((outcome) => ({
      number: findRankedNumber({ ranked: params.ranked, candidate: outcome.candidate }),
      key: buildItemKey({ item: outcome.candidate }),
      outcome: decideOutcomeKey({ kind: outcome.outcome, freedBytes: outcome.freedBytes }),
      reasonKey: outcome.outcome === 'removed' ? null : outcome.outcome,
      freedBytes: outcome.freedBytes,
    })),
    freedBytes: params.run.outcomes.reduce((sum, outcome) => sum + outcome.freedBytes, 0),
    returnsLaterBytes: 0,
    availableBytesAfter: params.availableBytesAfter,
    logPath: params.logPath,
  };
}

function decideOutcomeKey(params: {
  kind: RemovalOutcomeKind;
  freedBytes: number;
}): DeletedOutcomeKey {
  switch (outcomeClasses[params.kind]) {
    case 'removed':
      return 'removed';
    case 'kept':
      return 'kept';
    case 'unremoved':
      return params.freedBytes > 0 ? 'partlyRemoved' : 'failed';
  }
}
