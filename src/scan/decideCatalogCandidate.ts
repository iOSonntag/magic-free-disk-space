import type { CatalogEntry } from '../catalog/catalog.js';
import type { CatalogOwner } from '../catalog/catalogOwner.js';
import type { CandidateDecision, SkipReason } from './candidate.js';
import type { TargetsMeasurement } from './loadMeasuredTargetsPhase.js';
import { hasSymbolicLinkTarget } from './loadMeasuredTargetsPhase.js';
import type { ActivityProbe } from './loadTreeActivity.js';
import type { OwnerState } from './resolveOwnerState.js';
import { isAppleBundleId } from './resolveOwnerState.js';

/**
 * Offers a catalog item for removal as its measured targets, turns an advice entry into advice,
 * or skips the item. `activity` must be probed for an `unchangedDays` entry and `null` otherwise;
 * a mismatch throws.
 */
export function decideCatalogCandidate(params: {
  entry: CatalogEntry;
  /** The item's place, shown and judged: the entry's path, a child of it, or a profile folder. */
  path: string;
  measurement: TargetsMeasurement;
  owner: CatalogOwner | null;
  ownerBundlePaths: string[];
  ownerState: OwnerState;
  /** The installed app of the owner, by its name; `null` for none. */
  ownerAppName: string | null;
  activity: ActivityProbe | null;
  minOfferedBytes: number;
}): CandidateDecision {
  if (hasSymbolicLinkTarget(params.measurement)) {
    return { kind: 'skip', path: params.path, reason: 'symbolicLink' };
  }

  if (isSystemOwnedTarget({ entry: params.entry, owner: params.owner })) {
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
          origin: { kind: 'catalog', entryId: params.entry.id },
          explanation: params.entry.explanation,
          regeneration: params.entry.regeneration,
          allocatedBytes: params.measurement.allocatedBytes,
          entryCount: params.measurement.entryCount,
          isComplete: params.measurement.isComplete,
          privateSizeFallbackCount: params.measurement.privateSizeFallbackCount,
          lastUsedAtMs: null,
          downloadedAtMs: null,
          appName: params.ownerAppName,
          removal: {
            kind: 'deletePaths',
            targets: params.measurement.targets,
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
          origin: { kind: 'catalog', entryId: params.entry.id },
          path: params.path,
          title: params.entry.title,
          category: params.entry.category,
          risk: params.entry.risk,
          explanation: params.entry.explanation,
          advice: params.entry.removal.advice,
          opener: params.entry.removal.kind === 'advice' ? params.entry.removal.opener : null,
          allocatedBytes: params.measurement.allocatedBytes,
          isComplete: params.measurement.isComplete,
          privateSizeFallbackCount: params.measurement.privateSizeFallbackCount,
          lastUsedAtMs: null,
          downloadedAtMs: null,
          appName: params.ownerAppName,
        },
      };
  }
}

/** An Apple-named child of a `children` entry belongs to macOS; the scanner skips it unmeasured. */
export function isSystemOwnedTarget(params: {
  entry: CatalogEntry;
  owner: CatalogOwner | null;
}): boolean {
  if (params.entry.selection.kind !== 'children' || params.owner === null) {
    return false;
  }

  switch (params.owner.kind) {
    case 'bundleId':
      return isAppleBundleId({ bundleId: params.owner.bundleId });
  }
}

function getActivitySkipReason(params: {
  entry: CatalogEntry;
  activity: ActivityProbe | null;
}): SkipReason | null {
  if (params.entry.ageRule.kind === 'none') {
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
