import type { CandidateDecision, SkipReason } from './candidate.js';
import type { Measurement } from './loadPathMeasurement.js';
import { isAppleBundleId, isBundleIdShape } from './resolveOwnerState.js';

/**
 * Returns why a container name is no orphan, or `null` when it may be one. It needs no
 * measurement, so the scanner skips these names without reading their folders.
 */
export function getOrphanNameSkipReason(params: {
  name: string;
  installedBundleIds: Set<string>;
}): SkipReason | null {
  if (!isBundleIdShape({ name: params.name })) {
    return 'notBundleId';
  }

  if (isAppleBundleId({ bundleId: params.name })) {
    return 'systemOwned';
  }

  if (params.installedBundleIds.has(params.name)) {
    return 'ownerInstalled';
  }

  return null;
}

/** Offers the container `name` of an app that no installed bundle carries, else skips it. */
export function decideOrphanCandidate(params: {
  path: string;
  name: string;
  measurement: Measurement;
  installedBundleIds: Set<string>;
  minOfferedBytes: number;
}): CandidateDecision {
  const nameSkipReason = getOrphanNameSkipReason({
    name: params.name,
    installedBundleIds: params.installedBundleIds,
  });

  if (nameSkipReason !== null) {
    return { kind: 'skip', path: params.path, reason: nameSkipReason };
  }

  if (params.measurement.identity.kind === 'symbolicLink') {
    return { kind: 'skip', path: params.path, reason: 'symbolicLink' };
  }

  if (params.measurement.allocatedBytes < params.minOfferedBytes) {
    return { kind: 'skip', path: params.path, reason: 'belowSizeThreshold' };
  }

  return {
    kind: 'offer',
    candidate: {
      path: params.path,
      identity: params.measurement.identity,
      title: `Data of an app that is no longer installed (${params.name})`,
      category: 'leftovers',
      // Careful, not review: a container holds the documents of its app, such as virtual machines.
      risk: 'careful',
      origin: 'leftover',
      explanation:
        'The sandbox container of an app that is not in an Applications folder. It holds the settings and the documents of that app.',
      regeneration:
        'Not regenerated. If the app was moved elsewhere or is installed again, it starts without this data.',
      allocatedBytes: params.measurement.allocatedBytes,
      entryCount: params.measurement.entryCount,
      isComplete: params.measurement.isComplete,
      ownerBundlePaths: [],
    },
  };
}
