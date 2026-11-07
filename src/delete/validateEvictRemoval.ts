import { isAbsolute } from 'node:path';
import type { Environment } from '../environment/buildEnvironment.js';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { Candidate, CandidateRemovalEvictUnitFiles } from '../scan/candidate.js';
import type { RemovalDecision } from './validateRemoval.js';

/**
 * Approves an evict only when each target is a plain file strictly inside a cloud folder of the
 * environment, the one place where an evict is allowed and a delete never is.
 */
export function validateEvictRemoval(params: {
  candidate: Candidate;
  removal: CandidateRemovalEvictUnitFiles;
  environment: Environment;
}): RemovalDecision {
  for (const target of params.removal.targets) {
    const realPath = target.identity.realPath;

    switch (target.identity.kind) {
      case 'symbolicLink':
        return { kind: 'refused', path: target.path, reason: 'symbolicLink' };
      case 'file':
        break;
      default:
        return { kind: 'refused', path: target.path, reason: 'unsupportedKind' };
    }

    // Compared without case, as `validateRemoval` compares: the looser match only refuses more.
    const lowerCaseRealPath = realPath.toLowerCase();
    const isInsideEvictRoot =
      isAbsolute(realPath) &&
      params.environment.evictRealRoots.some((evictRoot) => {
        const lowerCaseEvictRoot = evictRoot.toLowerCase();

        return (
          lowerCaseRealPath !== lowerCaseEvictRoot &&
          isSameOrInsidePath({
            rules: params.environment.pathRules,
            path: lowerCaseRealPath,
            parentPath: lowerCaseEvictRoot,
          })
        );
      });

    if (!isInsideEvictRoot) {
      return { kind: 'refused', path: target.path, reason: 'outsideAllowedRoot' };
    }
  }

  return { kind: 'approved', candidate: params.candidate };
}
