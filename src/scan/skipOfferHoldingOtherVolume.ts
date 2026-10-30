import type { CandidateDecision } from './candidate.js';

/**
 * Turns an offer whose tree holds another mounted volume into a skip: a recursive removal would
 * delete into that volume, which the measurement never counted. Advice and skips pass unchanged.
 */
export function skipOfferHoldingOtherVolume(params: {
  decision: CandidateDecision;
  measurement: { holdsOtherVolume: boolean };
}): CandidateDecision {
  if (params.decision.kind !== 'offer' || !params.measurement.holdsOtherVolume) {
    return params.decision;
  }

  return { kind: 'skip', path: params.decision.candidate.path, reason: 'holdsOtherVolume' };
}
