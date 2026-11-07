import { isRemovableRisk } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { TargetRefusalReason, TargetRemovalKind } from '../environment/findTargetRefusal.js';
import { findTargetRefusal } from '../environment/findTargetRefusal.js';
import type { Candidate, RemovalTarget, RemovalTargets } from '../scan/candidate.js';

export type RefusalReason = 'neverRisk' | TargetRefusalReason;

export type RemovalDecisionApproved = { kind: 'approved'; candidate: Candidate };

export type RemovalDecisionRefused = { kind: 'refused'; path: string; reason: RefusalReason };

export type RemovalDecision = RemovalDecisionApproved | RemovalDecisionRefused;

/**
 * Refuses a candidate marked `never`. Approves an item of paths or an evict only when the
 * environment refuses none of its targets, as `findTargetRefusal` judges a delete or an evict. A
 * tool item and an engine item pass, since their own tool or engine removes them after a recheck.
 */
export function validateRemoval(params: {
  candidate: Candidate;
  environment: Environment;
}): RemovalDecision {
  if (!isRemovableRisk(params.candidate.risk)) {
    return { kind: 'refused', path: params.candidate.path, reason: 'neverRisk' };
  }

  switch (params.candidate.removal.kind) {
    case 'deletePaths':
    case 'deleteUnitPaths':
      return validateTargetsRemoval({
        candidate: params.candidate,
        removal: 'delete',
        targets: params.candidate.removal.targets,
        environment: params.environment,
      });
    case 'evictUnitFiles':
      return validateTargetsRemoval({
        candidate: params.candidate,
        removal: 'evict',
        targets: params.candidate.removal.targets,
        environment: params.environment,
      });
    case 'runTool':
    case 'callEngine':
      return { kind: 'approved', candidate: params.candidate };
  }
}

/** The first target refused refuses the whole item, at that target's path. */
function validateTargetsRemoval(params: {
  candidate: Candidate;
  removal: TargetRemovalKind;
  targets: RemovalTargets<RemovalTarget>;
  environment: Environment;
}): RemovalDecision {
  for (const target of params.targets) {
    const reason = findTargetRefusal({
      environment: params.environment,
      removal: params.removal,
      identity: target.identity,
    });

    if (reason !== null) {
      return { kind: 'refused', path: target.path, reason: reason };
    }
  }

  return { kind: 'approved', candidate: params.candidate };
}
