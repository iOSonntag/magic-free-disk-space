import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { CandidateDecision } from './candidate.js';

/**
 * Turns into a skip each offer that would delete what the scan held back or offered already:
 * an offer holding a skipped or advised path, an offer inside an advised path, an offer equal
 * to an earlier skipped path, and an offer overlapping an earlier kept offer. Paths are compared
 * as the scan produced them, never followed through links. The result keeps length and order.
 */
export function dedupeCandidates(params: { decisions: CandidateDecision[] }): CandidateDecision[] {
  const skippedPaths = params.decisions.flatMap((decision) =>
    decision.kind === 'skip' ? [decision.path] : [],
  );
  const advisedPaths = params.decisions.flatMap((decision) =>
    decision.kind === 'advice' ? [decision.advice.path] : [],
  );
  const earlierSkippedPaths: string[] = [];
  const keptOfferPaths: string[] = [];

  return params.decisions.map((decision): CandidateDecision => {
    if (decision.kind === 'skip') {
      earlierSkippedPaths.push(decision.path);

      return decision;
    }

    if (decision.kind === 'advice') {
      return decision;
    }

    const path = decision.candidate.path;
    const isOverlapping =
      [...skippedPaths, ...advisedPaths].some((heldPath) =>
        isStrictlyInsidePath({ path: heldPath, parentPath: path }),
      ) ||
      advisedPaths.some((advisedPath) =>
        isSameOrInsidePath({ path: path, parentPath: advisedPath }),
      ) ||
      earlierSkippedPaths.includes(path) ||
      keptOfferPaths.some(
        (keptPath) =>
          isSameOrInsidePath({ path: path, parentPath: keptPath }) ||
          isSameOrInsidePath({ path: keptPath, parentPath: path }),
      );

    if (isOverlapping) {
      return { kind: 'skip', path: path, reason: 'overlapsEarlierCandidate' };
    }

    keptOfferPaths.push(path);

    return decision;
  });
}

function isStrictlyInsidePath(params: { path: string; parentPath: string }): boolean {
  return params.path !== params.parentPath && isSameOrInsidePath(params);
}
