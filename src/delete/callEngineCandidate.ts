import { throwPartNotBuilt } from '../notBuilt.js';
import type { Candidate, CandidateRemovalCallEngine } from '../scan/candidate.js';
import type { RecordedRemoval } from './deleteCandidates.js';

/**
 * Checks the unit again over its engine's API at the socket its probe trusted, then removes it
 * there, never with `force`; one `engineCall` entry. A refusal of the engine keeps the item as
 * `engineInUse`, a gone socket as `engineNotRunning`. Never rejects.
 */
export function callEngineCandidate(_params: {
  candidate: Candidate;
  removal: CandidateRemovalCallEngine;
  clock: () => number;
}): Promise<RecordedRemoval> {
  return throwPartNotBuilt();
}
