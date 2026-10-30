import type { CandidateDecision, SkipReason } from './candidate.js';
import type { Measurement } from './loadPathMeasurement.js';
import { isAppleBundleId, isBundleIdShape } from './resolveOwnerState.js';

/**
 * Returns why a container name is no orphan, or `null` when it may be one. It needs no
 * measurement, so the scanner skips these names without reading their folders. While an
 * installed app could not be read, no container counts as orphaned: it may be that app's.
 */
export function getOrphanNameSkipReason(params: {
  name: string;
  installedBundleIds: Set<string>;
  isInstalledAppListComplete: boolean;
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

  if (!params.isInstalledAppListComplete) {
    return 'installedAppsUnknown';
  }

  return null;
}

/**
 * Offers the container `name` of an app that no installed bundle carries and that nothing in
 * the container changed since `unusedCutoffMs`, else skips it. A recent change means the app
 * still runs from somewhere outside the Applications folders.
 */
export function decideOrphanCandidate(params: {
  path: string;
  name: string;
  measurement: Measurement;
  installedBundleIds: Set<string>;
  isInstalledAppListComplete: boolean;
  unusedCutoffMs: number;
  minOfferedBytes: number;
}): CandidateDecision {
  const nameSkipReason = getOrphanNameSkipReason({
    name: params.name,
    installedBundleIds: params.installedBundleIds,
    isInstalledAppListComplete: params.isInstalledAppListComplete,
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

  // A partial walk may have missed the newest change.
  if (!params.measurement.isComplete) {
    return { kind: 'skip', path: params.path, reason: 'activityUnknown' };
  }

  if (params.measurement.latestModifiedMs >= params.unusedCutoffMs) {
    return { kind: 'skip', path: params.path, reason: 'recentActivity' };
  }

  return {
    kind: 'offer',
    candidate: {
      path: params.path,
      title: `Data of an app that is no longer installed (${params.name})`,
      category: 'leftovers',
      // Careful, not review: a container holds the documents of its app, such as virtual machines.
      risk: 'careful',
      origin: 'leftover',
      explanation:
        'The sandbox container of an app that is not in an Applications folder and that has not changed for the unused period. It holds the settings and the documents of that app.',
      regeneration:
        'Not regenerated. If the app was moved elsewhere or is installed again, it starts without this data.',
      allocatedBytes: params.measurement.allocatedBytes,
      entryCount: params.measurement.entryCount,
      isComplete: params.measurement.isComplete,
      removal: { kind: 'deletePath', identity: params.measurement.identity, ownerBundlePaths: [] },
      evidenceLines: [],
    },
  };
}
