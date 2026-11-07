import { isOverlappingPath } from '../path/isOverlappingPath.js';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { CandidateDecision, CandidateDecisionSkip, SkipReason } from './candidate.js';
import { isProbedCandidate } from './candidate.js';
import { listCandidateFootprint, listProbedTargetPaths } from './listCandidateFootprint.js';

/**
 * Turns into a skip each offer whose footprint would remove what the scan held back, advised on or
 * offered already, and each offer no probe made that takes a probe's place. Paths compare as the
 * scan produced them, never through links; the result keeps length and order.
 */
export function dedupeCandidates(params: {
  pathRules: PathRules;
  decisions: CandidateDecision[];
  /** The path of every explore entry, whether its probe ran or fell back to advice. */
  reservedEntryPaths: string[];
}): CandidateDecision[] {
  const skips = params.decisions.flatMap((decision) =>
    decision.kind === 'skip' ? [decision] : [],
  );
  const advisedPlaces = params.decisions.flatMap((decision): AdvisedPlace[] =>
    decision.kind === 'advice'
      ? [{ path: decision.advice.path, carvedPaths: decision.advice.carvedPaths }]
      : [],
  );
  const unitTargetPaths = params.decisions.flatMap((decision) =>
    decision.kind === 'offer' ? listProbedTargetPaths(decision.candidate) : [],
  );
  const earlierSkips: CandidateDecisionSkip[] = [];
  const keptOfferPaths: string[] = [];

  return params.decisions.map((decision): CandidateDecision => {
    if (decision.kind === 'skip') {
      earlierSkips.push(decision);

      return decision;
    }

    if (decision.kind === 'advice') {
      return decision;
    }

    const isProbed = isProbedCandidate(decision.candidate);
    const footprint = listCandidateFootprint(decision.candidate);
    const isOverlapping = footprint.some((path) =>
      isOverlappingHeldPath({
        pathRules: params.pathRules,
        path: path,
        skippedPaths: listHoldingSkipPaths({ skips: skips, isProbed: isProbed }),
        advisedPlaces: advisedPlaces,
        earlierSkippedPaths: listHoldingSkipPaths({ skips: earlierSkips, isProbed: isProbed }),
        keptOfferPaths: keptOfferPaths,
      }),
    );

    if (isOverlapping) {
      return { kind: 'skip', path: decision.candidate.path, reason: 'overlapsEarlierCandidate' };
    }

    const isHeldByProbe =
      !isProbed &&
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

/** The paths of the skips that hold the offer back: every skip, or for a probed offer all but an age skip. */
function listHoldingSkipPaths(params: {
  skips: CandidateDecisionSkip[];
  isProbed: boolean;
}): string[] {
  // A probe judges the activity of its own units, so a file skipped as recently used still goes.
  return params.skips
    .filter((skip) => !params.isProbed || !isAgeSkipReason(skip.reason))
    .map((skip) => skip.path);
}

/** Whether the skip judged the path by its age or its use, which a probe judges for its own units. */
function isAgeSkipReason(reason: SkipReason): boolean {
  switch (reason) {
    case 'recentActivity':
    case 'activityUnknown':
    case 'recentUse':
    case 'useUnknown':
      return true;
    case 'belowSizeThreshold':
    case 'symbolicLink':
    case 'protectedPath':
    case 'outsideAllowedRoot':
    case 'unsupportedKind':
    case 'systemOwned':
    case 'ownerRunning':
    case 'runningUnknown':
    case 'ownerInstalled':
    case 'genericName':
    case 'installsRunningSystem':
    case 'systemVersionUnknown':
    case 'notBundleId':
    case 'installedAppsUnknown':
    case 'holdsOtherVolume':
    case 'overlapsEarlierCandidate':
    case 'heldByProbe':
      return false;
  }
}

function isProbeReservedPath(params: {
  pathRules: PathRules;
  path: string;
  reservedEntryPaths: string[];
  unitTargetPaths: string[];
}): boolean {
  // Only an offer that holds the entry path gives way: a probe claims only what its units name.
  const isHoldingEntryPath = params.reservedEntryPaths.some((entryPath) =>
    isSameOrInsidePath({ rules: params.pathRules, path: entryPath, parentPath: params.path }),
  );

  if (isHoldingEntryPath) {
    return true;
  }

  return params.unitTargetPaths.some((targetPath) =>
    isOverlappingPath({ rules: params.pathRules, path: params.path, otherPath: targetPath }),
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
  const heldPaths = [...params.skippedPaths, ...params.advisedPlaces.map((place) => place.path)];
  // Any skip or advice counts, earlier or later: removing the path would remove what it holds back.
  const isHoldingHeldPath = heldPaths.some((heldPath) =>
    isStrictlyInsidePath({ pathRules: params.pathRules, path: heldPath, parentPath: params.path }),
  );

  if (isHoldingHeldPath) {
    return true;
  }

  const isInsideAdvisedPlace = params.advisedPlaces.some((place) =>
    isHeldByAdvice({ pathRules: params.pathRules, path: params.path, place: place }),
  );

  if (isInsideAdvisedPlace) {
    return true;
  }

  // On the same path the earlier entry's decision wins, so only an earlier skip holds it back.
  if (params.earlierSkippedPaths.includes(params.path)) {
    return true;
  }

  // The first offer of a place keeps it, so no two offers remove the same entry.
  return params.keptOfferPaths.some((keptPath) =>
    isOverlappingPath({ rules: params.pathRules, path: params.path, otherPath: keptPath }),
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
