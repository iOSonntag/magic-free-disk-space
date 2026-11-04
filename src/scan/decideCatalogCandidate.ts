import type {
  CatalogEntry,
  CatalogEntryOwner,
  CatalogRemoval,
  CatalogRemovalAdvice,
  CatalogRemovalExplore,
} from '../catalog/catalog.js';
import { isEngineProbeId } from '../catalog/catalog.js';
import type { CatalogOwner } from '../catalog/catalogOwner.js';
import type { PathRules } from '../path/pathRules.js';
import type {
  CandidateDecision,
  RemovalOwner,
  SkipReason,
  TargetsMeasurement,
} from './candidate.js';
import { hasSymbolicLinkTarget } from './candidate.js';
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
  /** The owner the deletion checks again, as `findRemovalOwner` finds it. */
  removalOwner: RemovalOwner;
  ownerState: OwnerState;
  /** The installed app of the owner, by its name; `null` for none. */
  ownerAppName: string | null;
  /** As `isOwnerUninstalled` tells it, so an explore entry's advice speaks of a removed app. */
  isOwnerUninstalled: boolean;
  activity: ActivityProbe | null;
  minOfferedBytes: number;
  /** The absolute paths of the entry's carved subpaths below `path`, from `buildCarvedPaths`. */
  carvedPaths: string[];
}): CandidateDecision {
  if (hasSymbolicLinkTarget(params.measurement)) {
    return { kind: 'skip', path: params.path, reason: 'symbolicLink' };
  }

  if (isSystemOwnedTarget({ entry: params.entry, owner: params.owner })) {
    return { kind: 'skip', path: params.path, reason: 'systemOwned' };
  }

  const ownerSkipReason = getOwnerSkipReason({
    removal: params.entry.removal,
    ownerState: params.ownerState,
  });

  if (ownerSkipReason !== null) {
    return { kind: 'skip', path: params.path, reason: ownerSkipReason };
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
            owner: params.removalOwner,
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
          advice: getAdviceText({
            removal: params.entry.removal,
            entryOwner: params.entry.owner,
            isOwnerUninstalled: params.isOwnerUninstalled,
          }),
          opener: params.entry.removal.kind === 'advice' ? params.entry.removal.opener : null,
          carvedPaths: params.carvedPaths,
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

/**
 * The absolute paths of an advice entry's carved subpaths below the item's path, which the
 * catalog writes with `/`; none for any other entry.
 */
export function buildCarvedPaths(params: {
  pathRules: PathRules;
  entry: CatalogEntry;
  path: string;
}): string[] {
  if (params.entry.removal.kind !== 'advice') {
    return [];
  }

  return params.entry.removal.carvedPaths.map((carvedPath) =>
    [params.path, ...carvedPath.split('/')].join(params.pathRules.separator),
  );
}

/**
 * An Apple-named child of a `children` entry belongs to macOS; the scanner skips it unmeasured. No
 * Windows program is told apart as the system's.
 */
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
    case 'bundleIdFamily':
    case 'executable':
      return false;
  }
}

/**
 * The skip of an entry whose owner runs or cannot be checked; `null` while it is stopped, and for
 * an entry its owner never holds back, as `isHeldByOwner` says.
 */
function getOwnerSkipReason(params: {
  removal: CatalogRemoval;
  ownerState: OwnerState;
}): SkipReason | null {
  if (!isHeldByOwner({ removal: params.removal })) {
    return null;
  }

  switch (params.ownerState) {
    case 'running':
      return 'ownerRunning';
    case 'unknown':
      return 'runningUnknown';
    case 'stopped':
      return null;
  }
}

/**
 * Whether a running owner holds the entry back: an advice deletes nothing, and an engine's own
 * running engine removes its units, but every other entry deletes what its owner may use.
 */
function isHeldByOwner(params: { removal: CatalogRemoval }): boolean {
  switch (params.removal.kind) {
    case 'delete':
      return true;
    case 'advice':
      return false;
    case 'explore':
      return !isEngineProbeId(params.removal.probe);
  }
}

/** The advice the owner words for once it is uninstalled, if any; the entry's own otherwise. */
function getAdviceText(params: {
  removal: CatalogRemovalAdvice | CatalogRemovalExplore;
  entryOwner: CatalogEntryOwner | null;
  isOwnerUninstalled: boolean;
}): string {
  if (
    params.isOwnerUninstalled &&
    params.entryOwner !== null &&
    params.entryOwner.uninstalledAdvice !== null
  ) {
    return params.entryOwner.uninstalledAdvice;
  }

  return params.removal.advice;
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
