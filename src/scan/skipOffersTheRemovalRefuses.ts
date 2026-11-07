import type { Environment } from '../environment/buildEnvironment.js';
import type { TargetRefusalReason, TargetRemovalKind } from '../environment/findTargetRefusal.js';
import { findTargetRefusal } from '../environment/findTargetRefusal.js';
import type {
  CandidateDecision,
  CandidateRemoval,
  RemovalTarget,
  SkipReason,
} from './candidate.js';

const refusalSkipReasons: Record<TargetRefusalReason, SkipReason> = {
  protectedRoot: 'protectedPath',
  outsideAllowedRoot: 'outsideAllowedRoot',
  symbolicLink: 'symbolicLink',
  unsupportedKind: 'unsupportedKind',
};

/**
 * Turns each offer the removal plan would refuse at one of its targets into a skip, for the
 * reason the plan would give: it judges each target's scan identity with `findTargetRefusal`, as
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

    const reason = findRemovalRefusal({
      environment: params.environment,
      removal: decision.candidate.removal,
    });

    if (reason === null) {
      return decision;
    }

    return { kind: 'skip', path: decision.candidate.path, reason: refusalSkipReasons[reason] };
  });
}

function findRemovalRefusal(params: {
  environment: Environment;
  removal: CandidateRemoval;
}): TargetRefusalReason | null {
  switch (params.removal.kind) {
    case 'deletePaths':
    case 'deleteUnitPaths':
      return findTargetsRefusal({
        environment: params.environment,
        removal: 'delete',
        targets: params.removal.targets,
      });
    case 'evictUnitFiles':
      return findTargetsRefusal({
        environment: params.environment,
        removal: 'evict',
        targets: params.removal.targets,
      });
    // A tool or an engine removes what it owns itself; the plan checks no path of theirs either.
    case 'runTool':
    case 'callEngine':
      return null;
  }
}

/** The refusal of the first target refused, as the plan refuses the item at it. */
function findTargetsRefusal(params: {
  environment: Environment;
  removal: TargetRemovalKind;
  targets: RemovalTarget[];
}): TargetRefusalReason | null {
  for (const target of params.targets) {
    const reason = findTargetRefusal({
      environment: params.environment,
      removal: params.removal,
      identity: target.identity,
    });

    if (reason !== null) {
      return reason;
    }
  }

  return null;
}
