import type { CatalogEntry } from '../catalog/catalog.js';
import type { CandidateDecision, SkipReason } from './candidate.js';
import type { Measurement } from './loadPathMeasurement.js';
import type { ActivityProbe } from './loadTreeActivity.js';
import type { OwnerState } from './resolveOwnerState.js';
import { isAppleBundleId } from './resolveOwnerState.js';

/**
 * Offers a catalog path for removal, turns an advice entry into advice, or skips the path.
 * `activity` must be probed for a `staleDays` entry and `null` otherwise; a mismatch throws.
 */
export function decideCatalogCandidate(params: {
  entry: CatalogEntry;
  path: string;
  measurement: Measurement;
  ownerBundleId: string | null;
  ownerBundlePaths: string[];
  ownerState: OwnerState;
  activity: ActivityProbe | null;
  minOfferedBytes: number;
}): CandidateDecision {
  if (params.measurement.identity.kind === 'symbolicLink') {
    return { kind: 'skip', path: params.path, reason: 'symbolicLink' };
  }

  if (isSystemOwnedTarget({ entry: params.entry, ownerBundleId: params.ownerBundleId })) {
    return { kind: 'skip', path: params.path, reason: 'systemOwned' };
  }

  if (params.ownerState === 'running') {
    return { kind: 'skip', path: params.path, reason: 'ownerRunning' };
  }

  if (params.ownerState === 'unknown') {
    return { kind: 'skip', path: params.path, reason: 'runningUnknown' };
  }

  if (params.measurement.allocatedBytes < params.minOfferedBytes) {
    return { kind: 'skip', path: params.path, reason: 'belowSizeThreshold' };
  }

  const activitySkipReason = getActivitySkipReason({
    entry: params.entry,
    activity: params.activity,
  });

  if (activitySkipReason !== null) {
    return { kind: 'skip', path: params.path, reason: activitySkipReason };
  }

  switch (params.entry.removal.kind) {
    case 'delete':
      return {
        kind: 'offer',
        candidate: {
          path: params.path,
          title: params.entry.title,
          category: params.entry.category,
          risk: params.entry.risk,
          origin: 'catalog',
          explanation: params.entry.explanation,
          regeneration: params.entry.regeneration,
          allocatedBytes: params.measurement.allocatedBytes,
          entryCount: params.measurement.entryCount,
          isComplete: params.measurement.isComplete,
          removal: {
            kind: 'deletePath',
            identity: params.measurement.identity,
            ownerBundlePaths: params.ownerBundlePaths,
          },
        },
      };
    // An explore entry reaches this decision only when its probe did not run.
    case 'advice':
    case 'explore':
      return {
        kind: 'advice',
        advice: {
          path: params.path,
          title: params.entry.title,
          category: params.entry.category,
          risk: params.entry.risk,
          explanation: params.entry.explanation,
          advice: params.entry.removal.advice,
          allocatedBytes: params.measurement.allocatedBytes,
          isComplete: params.measurement.isComplete,
        },
      };
  }
}

/** An Apple-named child of a `children` entry belongs to macOS; the scanner skips it unmeasured. */
export function isSystemOwnedTarget(params: {
  entry: CatalogEntry;
  ownerBundleId: string | null;
}): boolean {
  return (
    params.entry.scope === 'children' &&
    params.ownerBundleId !== null &&
    isAppleBundleId({ bundleId: params.ownerBundleId })
  );
}

function getActivitySkipReason(params: {
  entry: CatalogEntry;
  activity: ActivityProbe | null;
}): SkipReason | null {
  if (params.entry.ageRule === 'none') {
    if (params.activity !== null) {
      throw new Error(`Catalog entry ${params.entry.id} has no age rule but was probed`);
    }

    return null;
  }

  if (params.activity === null) {
    throw new Error(`Catalog entry ${params.entry.id} needs an activity probe`);
  }

  if (params.activity === 'recent') {
    return 'recentActivity';
  }

  if (params.activity === 'unknown') {
    return 'activityUnknown';
  }

  return null;
}
