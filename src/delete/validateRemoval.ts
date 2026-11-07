import { isRemovableRisk } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { TargetRefusalReason } from '../environment/findTargetRefusal.js';
import type { Candidate } from '../scan/candidate.js';
import { findRemovalRefusal } from '../scan/findRemovalRefusal.js';

export type RefusalReason = 'neverRisk' | TargetRefusalReason;

export type RemovalDecisionApproved = { kind: 'approved'; candidate: Candidate };

export type RemovalDecisionRefused = { kind: 'refused'; path: string; reason: RefusalReason };

export type RemovalDecision = RemovalDecisionApproved | RemovalDecisionRefused;

/**
 * Refuses a candidate marked `never`, then one at the first target `findRemovalRefusal` refuses.
 * A tool item and an engine item pass, since their own tool or engine removes them after a recheck.
 */
export function validateRemoval(params: {
  candidate: Candidate;
  environment: Environment;
}): RemovalDecision {
  if (!isRemovableRisk(params.candidate.risk)) {
    return { kind: 'refused', path: params.candidate.path, reason: 'neverRisk' };
  }

  const refusal = findRemovalRefusal({
    environment: params.environment,
    removal: params.candidate.removal,
  });

  if (refusal !== null) {
    return { kind: 'refused', path: refusal.path, reason: refusal.reason };
  }

  return { kind: 'approved', candidate: params.candidate };
}
