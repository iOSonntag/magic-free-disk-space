import { isAbsolute } from 'node:path';
import type { Environment } from '../environment/buildEnvironment.js';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { Candidate } from '../scan/candidate.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';

export type RefusalReason =
  | 'neverRisk'
  | 'protectedRoot'
  | 'outsideAllowedRoot'
  | 'symbolicLink'
  | 'unsupportedKind';

export type RemovalDecisionApproved = { kind: 'approved'; candidate: Candidate };

export type RemovalDecisionRefused = { kind: 'refused'; path: string; reason: RefusalReason };

export type RemovalDecision = RemovalDecisionApproved | RemovalDecisionRefused;

/**
 * Refuses a candidate marked `never`. Approves a path item or a unit's folder only when it is a
 * plain file or folder strictly inside an allowed root, is no protected folder and holds none, and
 * lies in no sensitive folder; a tool item passes, since its own tool removes it after a recheck.
 */
export function validateRemoval(params: {
  candidate: Candidate;
  environment: Environment;
}): RemovalDecision {
  if (params.candidate.risk === 'never') {
    return { kind: 'refused', path: params.candidate.path, reason: 'neverRisk' };
  }

  switch (params.candidate.removal.kind) {
    case 'deletePath':
    case 'deleteUnitFolder':
      return validatePathRemoval({
        candidate: params.candidate,
        identity: params.candidate.removal.identity,
        environment: params.environment,
      });
    case 'runTool':
      return { kind: 'approved', candidate: params.candidate };
  }
}

function validatePathRemoval(params: {
  candidate: Candidate;
  identity: FileIdentity;
  environment: Environment;
}): RemovalDecision {
  const path = params.candidate.path;
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
    isSameOrInsidePath({ path: protectedPath.toLowerCase(), parentPath: lowerCaseRealPath }),
  );
  const isInsideSensitivePath = params.environment.sensitiveRealPaths.some((sensitivePath) =>
    isSameOrInsidePath({ path: lowerCaseRealPath, parentPath: sensitivePath.toLowerCase() }),
  );

  if (holdsProtectedPath || isInsideSensitivePath) {
    return { kind: 'refused', path: path, reason: 'protectedRoot' };
  }

  const isInsideAllowedRoot = params.environment.allowedRealRoots.some(
    (allowedRoot) =>
      realPath !== allowedRoot && isSameOrInsidePath({ path: realPath, parentPath: allowedRoot }),
  );

  if (!isInsideAllowedRoot) {
    return { kind: 'refused', path: path, reason: 'outsideAllowedRoot' };
  }

  return { kind: 'approved', candidate: params.candidate };
}
