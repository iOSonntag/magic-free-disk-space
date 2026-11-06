import { isAbsolute } from 'node:path';
import type { Risk } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { Candidate, RemovalTarget, RemovalTargets } from '../scan/candidate.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import { validateEvictRemoval } from './validateEvictRemoval.js';

export type RefusalReason =
  | 'neverRisk'
  | 'protectedRoot'
  | 'outsideAllowedRoot'
  | 'symbolicLink'
  | 'unsupportedKind';

export type RemovalDecisionApproved = { kind: 'approved'; candidate: Candidate };

export type RemovalDecisionRefused = { kind: 'refused'; path: string; reason: RefusalReason };

export type RemovalDecision = RemovalDecisionApproved | RemovalDecisionRefused;

/** Whether the tool may ever remove an item of this risk; a `never` item it refuses. */
export function isRemovableRisk(risk: Risk): boolean {
  switch (risk) {
    case 'safe':
    case 'review':
    case 'careful':
      return true;
    case 'never':
      return false;
  }
}

/**
 * Refuses a candidate marked `never`. Approves an item of paths only when each target is a plain
 * file or folder strictly inside an allowed root, is no protected folder and holds none, and lies
 * in no sensitive folder; an evict only as `validateEvictRemoval` allows it. A tool item and an
 * engine item pass, since their own tool or engine removes them after a recheck.
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
        targets: params.candidate.removal.targets,
        environment: params.environment,
      });
    case 'evictUnitFiles':
      return validateEvictRemoval({
        candidate: params.candidate,
        removal: params.candidate.removal,
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
  targets: RemovalTargets<RemovalTarget>;
  environment: Environment;
}): RemovalDecision {
  for (const target of params.targets) {
    const refusal = findTargetRefusal({
      path: target.path,
      identity: target.identity,
      environment: params.environment,
    });

    if (refusal !== null) {
      return refusal;
    }
  }

  return { kind: 'approved', candidate: params.candidate };
}

function findTargetRefusal(params: {
  path: string;
  identity: FileIdentity;
  environment: Environment;
}): RemovalDecisionRefused | null {
  const path = params.path;
  const realPath = params.identity.realPath;
  const kind = params.identity.kind;

  if (kind === 'symbolicLink') {
    return { kind: 'refused', path: path, reason: 'symbolicLink' };
  }

  if (kind !== 'file' && kind !== 'directory') {
    return { kind: 'refused', path: path, reason: 'unsupportedKind' };
  }

  if (!isAbsolute(realPath)) {
    return { kind: 'refused', path: path, reason: 'outsideAllowedRoot' };
  }

  // Compared without case: macOS disks usually ignore it, and the looser match only refuses more.
  const lowerCaseRealPath = realPath.toLowerCase();
  const holdsProtectedPath = [
    ...params.environment.protectedRealPaths,
    ...params.environment.sensitiveRealPaths,
  ].some((protectedPath) =>
    isSameOrInsidePath({
      rules: params.environment.pathRules,
      path: protectedPath.toLowerCase(),
      parentPath: lowerCaseRealPath,
    }),
  );
  const isInsideSensitivePath = params.environment.sensitiveRealPaths.some((sensitivePath) =>
    isSameOrInsidePath({
      rules: params.environment.pathRules,
      path: lowerCaseRealPath,
      parentPath: sensitivePath.toLowerCase(),
    }),
  );

  if (holdsProtectedPath || isInsideSensitivePath) {
    return { kind: 'refused', path: path, reason: 'protectedRoot' };
  }

  const isInsideAllowedRoot = params.environment.allowedRealRoots.some(
    (allowedRoot) =>
      realPath !== allowedRoot &&
      isSameOrInsidePath({
        rules: params.environment.pathRules,
        path: realPath,
        parentPath: allowedRoot,
      }),
  );

  if (!isInsideAllowedRoot) {
    return { kind: 'refused', path: path, reason: 'outsideAllowedRoot' };
  }

  return null;
}
