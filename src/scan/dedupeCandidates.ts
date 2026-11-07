import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { CandidateDecision } from './candidate.js';
import { isProbedCandidate } from './candidate.js';
import { listCandidateFootprint, listProbedTargetPaths } from './listCandidateFootprint.js';

/**
 * Turns into a skip each offer with a footprint path that would remove what the scan held back
 * or offered already: one holding a skipped or advised path, one inside an advised path but
 * outside the advice's carved paths, one equal to an earlier skipped path, and one overlapping an
 * earlier kept footprint. Paths are
 * compared as the scan produced them, never followed through links. The result keeps length and
 * order.
 *
 * Then a probe's places are its own: an offer that no probe made gives way as `heldByProbe` when
 * its footprint holds or equals one of `reservedEntryPaths`, or holds, equals, or lies inside a
 * target of a probed offer. An offer inside an entry path stays, since a probe claims only what
 * its units name.
 */
export function dedupeCandidates(params: {
  pathRules: PathRules;
  decisions: CandidateDecision[];
  /** The path of every explore entry, whether its probe ran or fell back to advice. */
  reservedEntryPaths: string[];
}): CandidateDecision[] {
  const skippedPaths = params.decisions.flatMap((decision) =>
    decision.kind === 'skip' ? [decision.path] : [],
  );
  const advisedPlaces = params.decisions.flatMap((decision): AdvisedPlace[] =>
    decision.kind === 'advice'
      ? [{ path: decision.advice.path, carvedPaths: decision.advice.carvedPaths }]
      : [],
  );
  const unitTargetPaths = params.decisions.flatMap((decision) =>
    decision.kind === 'offer' ? listProbedTargetPaths(decision.candidate) : [],
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
        advisedPlaces: advisedPlaces,
        earlierSkippedPaths: earlierSkippedPaths,
        keptOfferPaths: keptOfferPaths,
      }),
    );

    if (isOverlapping) {
      return { kind: 'skip', path: decision.candidate.path, reason: 'overlapsEarlierCandidate' };
    }

    const isHeldByProbe =
      !isProbedCandidate(decision.candidate) &&
      footprint.some((path) =>
        isProbeReservedPath({
          pathRules: params.pathRules,
          path: path,
          reservedEntryPaths: params.reservedEntryPaths,
          unitTargetPaths: unitTargetPaths,
        }),
      );

    if (isHeldByProbe) {
      return { kind: 'skip', path: decision.candidate.path, reason: 'heldByProbe' };
    }

    keptOfferPaths.push(...footprint);

    return decision;
  });
}

function isProbeReservedPath(params: {
  pathRules: PathRules;
  path: string;
  reservedEntryPaths: string[];
  unitTargetPaths: string[];
}): boolean {
  return (
    params.reservedEntryPaths.some((entryPath) =>
      isSameOrInsidePath({ rules: params.pathRules, path: entryPath, parentPath: params.path }),
    ) ||
    params.unitTargetPaths.some(
      (targetPath) =>
        isSameOrInsidePath({
          rules: params.pathRules,
          path: targetPath,
          parentPath: params.path,
        }) ||
        isSameOrInsidePath({ rules: params.pathRules, path: params.path, parentPath: targetPath }),
    )
  );
}

/** An advice's path with the paths inside it that other entries offer, which it never holds back. */
type AdvisedPlace = { path: string; carvedPaths: string[] };

function isOverlappingHeldPath(params: {
  pathRules: PathRules;
  path: string;
  skippedPaths: string[];
  advisedPlaces: AdvisedPlace[];
  earlierSkippedPaths: string[];
  keptOfferPaths: string[];
}): boolean {
  return (
    [...params.skippedPaths, ...params.advisedPlaces.map((place) => place.path)].some((heldPath) =>
      isStrictlyInsidePath({
        pathRules: params.pathRules,
        path: heldPath,
        parentPath: params.path,
      }),
    ) ||
    params.advisedPlaces.some((place) =>
      isHeldByAdvice({ pathRules: params.pathRules, path: params.path, place: place }),
    ) ||
    params.earlierSkippedPaths.includes(params.path) ||
    params.keptOfferPaths.some(
      (keptPath) =>
        isSameOrInsidePath({ rules: params.pathRules, path: params.path, parentPath: keptPath }) ||
        isSameOrInsidePath({ rules: params.pathRules, path: keptPath, parentPath: params.path }),
    )
  );
}

/** Inside the advised path, unless inside one of its carved paths, which the advice leaves out. */
function isHeldByAdvice(params: {
  pathRules: PathRules;
  path: string;
  place: AdvisedPlace;
}): boolean {
  return (
    isSameOrInsidePath({
      rules: params.pathRules,
      path: params.path,
      parentPath: params.place.path,
    }) &&
    !params.place.carvedPaths.some((carvedPath) =>
      isSameOrInsidePath({ rules: params.pathRules, path: params.path, parentPath: carvedPath }),
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
