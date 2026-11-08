import type { Environment } from '../environment/buildEnvironment.js';
import type { TargetRefusalReason, TargetRemovalKind } from '../environment/findTargetRefusal.js';
import { findTargetRefusal } from '../environment/findTargetRefusal.js';
import type { CandidateRemoval, RemovalTarget } from './candidate.js';

/** A target the environment refuses to remove, at its path and for its reason. */
export type RemovalTargetRefusal = { path: string; reason: TargetRefusalReason };

/**
 * The first target of a delete or an evict that `findTargetRefusal` refuses, in target order;
 * `null` when it refuses none, and for a tool or an engine, which removes what it owns itself. A
 * Recycle Bin, which the system empties, is refused at its drive root unless the environment
 * lists that root among its fixed drives.
 */
export function findRemovalRefusal(params: {
  environment: Environment;
  removal: CandidateRemoval;
}): RemovalTargetRefusal | null {
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
    case 'runTool':
    case 'callEngine':
      return null;
    case 'emptyRecycleBin':
      if (params.environment.fixedDriveRoots.includes(params.removal.driveRoot)) {
        return null;
      }

      return { path: params.removal.driveRoot, reason: 'outsideAllowedRoot' };
  }
}

function findTargetsRefusal(params: {
  environment: Environment;
  removal: TargetRemovalKind;
  targets: RemovalTarget[];
}): RemovalTargetRefusal | null {
  for (const target of params.targets) {
    const reason = findTargetRefusal({
      environment: params.environment,
      removal: params.removal,
      identity: target.identity,
    });

    if (reason !== null) {
      return { path: target.path, reason: reason };
    }
  }

  return null;
}
