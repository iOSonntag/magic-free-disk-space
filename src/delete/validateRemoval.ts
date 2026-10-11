import { isAbsolute } from 'node:path';
import type { Environment } from '../environment/buildEnvironment.js';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { Candidate } from '../scan/candidate.js';

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
 * Approves a candidate only when it is a plain file or folder strictly inside an allowed root,
 * is no protected folder and holds none, lies in no sensitive folder, and is not marked `never`.
 */
export function validateRemoval(params: {
  candidate: Candidate;
  environment: Environment;
}): RemovalDecision {
  const path = params.candidate.path;
  const realPath = params.candidate.identity.realPath;
  const kind = params.candidate.identity.kind;

  if (params.candidate.risk === 'never') {
    return { kind: 'refused', path: path, reason: 'neverRisk' };
  }

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
