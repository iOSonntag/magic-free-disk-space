import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { CandidateDecision } from './candidate.js';
import { listCandidateFootprint } from './listCandidateFootprint.js';

/**
 * Turns into a skip each offer with a footprint path that would remove what the scan held back
 * or offered already: one holding a skipped or advised path, one inside an advised path, one
 * equal to an earlier skipped path, and one overlapping an earlier kept footprint. Paths are
 * compared as the scan produced them, never followed through links. The result keeps length and
 * order.
 */
export function dedupeCandidates(params: {
  pathRules: PathRules;
  decisions: CandidateDecision[];
}): CandidateDecision[] {
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

    const footprint = listCandidateFootprint(decision.candidate);
    const isOverlapping = footprint.some((path) =>
      isOverlappingHeldPath({
        pathRules: params.pathRules,
        path: path,
        skippedPaths: skippedPaths,
        advisedPaths: advisedPaths,
        earlierSkippedPaths: earlierSkippedPaths,
        keptOfferPaths: keptOfferPaths,
      }),
    );

    if (isOverlapping) {
      return { kind: 'skip', path: decision.candidate.path, reason: 'overlapsEarlierCandidate' };
    }

    keptOfferPaths.push(...footprint);

    return decision;
  });
}

function isOverlappingHeldPath(params: {
  pathRules: PathRules;
  path: string;
  skippedPaths: string[];
  advisedPaths: string[];
  earlierSkippedPaths: string[];
  keptOfferPaths: string[];
}): boolean {
  return (
    [...params.skippedPaths, ...params.advisedPaths].some((heldPath) =>
      isStrictlyInsidePath({
        pathRules: params.pathRules,
        path: heldPath,
        parentPath: params.path,
      }),
    ) ||
    params.advisedPaths.some((advisedPath) =>
      isSameOrInsidePath({ rules: params.pathRules, path: params.path, parentPath: advisedPath }),
    ) ||
    params.earlierSkippedPaths.includes(params.path) ||
    params.keptOfferPaths.some(
      (keptPath) =>
        isSameOrInsidePath({ rules: params.pathRules, path: params.path, parentPath: keptPath }) ||
        isSameOrInsidePath({ rules: params.pathRules, path: keptPath, parentPath: params.path }),
    )
  );
}

function isStrictlyInsidePath(params: {
  pathRules: PathRules;
  path: string;
  parentPath: string;
}): boolean {
  return (
    params.path !== params.parentPath &&
    isSameOrInsidePath({
      rules: params.pathRules,
      path: params.path,
      parentPath: params.parentPath,
    })
  );
}
