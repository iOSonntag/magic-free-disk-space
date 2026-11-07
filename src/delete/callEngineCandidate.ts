import { callEngineUnit } from '../explore/engines/callEngineUnit.js';
import { listEngineUnitIds } from '../explore/exploreUnit.js';
import type { Candidate, CandidateRemovalCallEngine } from '../scan/candidate.js';
import type { UserIdentity } from '../system/userIdentity.js';
import type { RecordedRemoval } from './deleteCandidates.js';

/** How long the engine has for each read of the recheck, and for each removal request. */
export const ENGINE_CALL_TIMEOUT_MS = 120_000;

/**
 * Checks the unit again over its engine's API at the socket its probe trusted, then removes it
 * there, never with `force`; one `engineCall` entry. A refusal of the engine keeps the item as
 * `engineInUse`, a gone socket as `engineNotRunning`. Never rejects.
 */
export async function callEngineCandidate(params: {
  candidate: Candidate;
  removal: CandidateRemovalCallEngine;
  user: UserIdentity;
  clock: () => number;
}): Promise<RecordedRemoval> {
  const unit = params.removal.unit;
  const call = await callEngineUnit({
    unit: unit,
    user: params.user,
    timeoutMs: ENGINE_CALL_TIMEOUT_MS,
  });

  return {
    outcome: {
      candidate: params.candidate,
      freedBytes: call.freedBytes,
      outcome: call.outcome,
      code: call.code,
    },
    outcomeEntries: [
      {
        kind: 'engineCall',
        atMs: params.clock(),
        engineName: unit.engineName,
        unitKind: unit.kind,
        unitIds: listEngineUnitIds(unit),
        outcome: call.outcome,
        status: call.status,
      },
    ],
  };
}
