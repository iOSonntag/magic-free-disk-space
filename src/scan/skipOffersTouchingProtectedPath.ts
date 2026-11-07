import type { Environment } from '../environment/buildEnvironment.js';
import { isTouchingProtectedPath } from '../environment/isTouchingProtectedPath.js';
import type { Candidate, CandidateDecision } from './candidate.js';

/**
 * Turns each offer that the removal plan would refuse as protected into a skip: one with a target
 * that is, holds, or lies in a guarded path outside its exceptions. It compares each target's real
 * path from its scan identity, the path the plan compares. Advice and skips pass unchanged.
 */
export function skipOffersTouchingProtectedPath(params: {
  environment: Environment;
  decisions: CandidateDecision[];
}): CandidateDecision[] {
  return params.decisions.map((decision) => {
    if (decision.kind !== 'offer') {
      return decision;
    }
    if (
      !isOfferTouchingProtectedPath({
        environment: params.environment,
        candidate: decision.candidate,
      })
    ) {
      return decision;
    }

    return { kind: 'skip', path: decision.candidate.path, reason: 'protectedPath' };
  });
}

function isOfferTouchingProtectedPath(params: {
  environment: Environment;
  candidate: Candidate;
}): boolean {
  switch (params.candidate.removal.kind) {
    case 'deletePaths':
    case 'deleteUnitPaths':
    case 'evictUnitFiles':
      return params.candidate.removal.targets.some((target) =>
        isTouchingProtectedPath({
          environment: params.environment,
          realPath: target.identity.realPath,
        }),
      );
    // A tool or an engine removes what it owns itself; the plan checks no path of theirs either.
    case 'runTool':
    case 'callEngine':
      return false;
  }
}
