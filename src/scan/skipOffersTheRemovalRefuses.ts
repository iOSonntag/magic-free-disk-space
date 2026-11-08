import type { Environment } from '../environment/buildEnvironment.js';
import type { TargetRefusalReason } from '../environment/findTargetRefusal.js';
import type { CandidateDecision, SkipReason } from './candidate.js';
import { findRemovalRefusal } from './findRemovalRefusal.js';

const refusalSkipReasons: Record<TargetRefusalReason, SkipReason> = {
  protectedRoot: 'protectedPath',
  outsideAllowedRoot: 'outsideAllowedRoot',
  symbolicLink: 'symbolicLink',
  unsupportedKind: 'unsupportedKind',
};

/**
 * Turns each offer the removal plan would refuse at one of its targets into a skip at the offer's
 * path, for the reason the plan would give: it judges the removal with `findRemovalRefusal`, as
 * the plan does. Advice and skips pass unchanged.
 */
export function skipOffersTheRemovalRefuses(params: {
  environment: Environment;
  decisions: CandidateDecision[];
}): CandidateDecision[] {
  return params.decisions.map((decision) => {
    if (decision.kind !== 'offer') {
      return decision;
    }

    const refusal = findRemovalRefusal({
      environment: params.environment,
      removal: decision.candidate.removal,
    });

    if (refusal === null) {
      return decision;
    }

    return {
      kind: 'skip',
      path: decision.candidate.path,
      reason: refusalSkipReasons[refusal.reason],
    };
  });
}
