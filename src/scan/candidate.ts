import type { AdviceOpener, CandidateCategory, Risk } from '../catalog/catalog.js';
import type {
  ExploreEngineUnit,
  ExploreEvictUnit,
  ExplorePathUnit,
  ExploreToolUnit,
} from '../explore/exploreUnit.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import type {
  CandidateOrigin,
  CandidateOriginApplication,
  CandidateOriginCatalog,
  CandidateOriginExplore,
} from './candidateOrigin.js';
import type { Measurement } from './loadPathMeasurement.js';

/**
 * A path a removal takes away, with the identity the scan read, checked again right before. A
 * plain string as every path of the scan's matched items is; a probe's targets are absolute paths.
 */
export type RemovalTarget = { path: string; identity: FileIdentity };

/** What a removal takes away, never empty: the one home of its paths after the scan. */
export type RemovalTargets<TTarget> = [TTarget, ...TTarget[]];

/** An offer of its targets as a decision reads it: each target with its identity, one tally. */
export type TargetsMeasurement<TTarget extends RemovalTarget = RemovalTarget> = Omit<
  Measurement,
  'identity'
> & {
  targets: RemovalTargets<TTarget>;
};

/**
 * True when a target is a symbolic link, which the scan never offers: its deletion would take the
 * link, not the place the rule judged.
 */
export function hasSymbolicLinkTarget(measurement: TargetsMeasurement): boolean {
  return measurement.targets.some((target) => target.identity.kind === 'symbolicLink');
}

/** An evict also needs "still downloaded and untouched": its recheck compares these with a fresh lstat. */
export type EvictTarget = RemovalTarget & { modifiedMs: number; accessedMs: number };

/** Deleted as its targets, each only while its identity still matches the scan. */
export type CandidateRemovalDeletePaths = {
  kind: 'deletePaths';
  targets: RemovalTargets<RemovalTarget>;
  /** App bundles whose running process withholds the item, checked again right before deletion. */
  ownerBundlePaths: string[];
};

/** Removed by the command of the unit's own tool, after the unit is checked again. */
export type CandidateRemovalRunTool = { kind: 'runTool'; unit: ExploreToolUnit };

/**
 * Deleted as its targets, after the unit is checked again and each target only while its
 * identity still matches the scan.
 */
export type CandidateRemovalDeleteUnitPaths = {
  kind: 'deleteUnitPaths';
  targets: RemovalTargets<RemovalTarget>;
  unit: ExplorePathUnit;
};

/** Evicted file by file, each only while it is still downloaded and untouched since the scan. */
export type CandidateRemovalEvictUnitFiles = {
  kind: 'evictUnitFiles';
  targets: RemovalTargets<EvictTarget>;
  unit: ExploreEvictUnit;
};

/** Removed through the API of the unit's engine, at the socket its probe trusted. */
export type CandidateRemovalCallEngine = { kind: 'callEngine'; unit: ExploreEngineUnit };

/** How a probed item goes. */
export type CandidateRemovalProbed =
  | CandidateRemovalRunTool
  | CandidateRemovalDeleteUnitPaths
  | CandidateRemovalEvictUnitFiles
  | CandidateRemovalCallEngine;

export type CandidateRemoval = CandidateRemovalDeletePaths | CandidateRemovalProbed;

/** What an item is and what it holds, the same for every origin. */
export type CandidateListing = {
  /**
   * The path shown and sorted by, never what goes: for a tool item the place of its unit, for an
   * engine item its engine's disk image.
   */
  path: string;
  title: string;
  category: CandidateCategory;
  risk: Risk;
  explanation: string;
  regeneration: string;
  allocatedBytes: number;
  entryCount: number;
  /** False when the size is a lower bound: unreadable entries or a deadline. */
  isComplete: boolean;
  /** Entries whose size counts every block, because their private size could not be read. */
  privateSizeFallbackCount: number;
  /** The last sign of use the scan judged the item by; `null` when it judged none. */
  lastUsedAtMs: number | null;
  /** When the item came onto this Mac; `null` until a source reads it. */
  downloadedAtMs: number | null;
  /** The app the item belongs to, installed or of the system, by the name the person knows it by. */
  appName: string | null;
};

/** An item a rule matched to paths on disk, deleted as those paths. */
export type CandidateMatched = CandidateListing & {
  origin: Exclude<CandidateOrigin, CandidateOriginExplore>;
  removal: CandidateRemovalDeletePaths;
};

/**
 * An item a probe of Explore found, removed by the command of its tool, as its unit's paths, by
 * an evict, or through its engine.
 */
export type CandidateProbed = CandidateListing & {
  origin: CandidateOriginExplore;
  removal: CandidateRemovalProbed;
  /** What the probe found that makes the item safe to offer. */
  evidenceLines: string[];
};

export type Candidate = CandidateMatched | CandidateProbed;

export type Advice = {
  /**
   * Advice comes from a catalog entry, whose place the person handles with its own tool, or from an
   * app the person must remove themselves, such as an installer that root owns.
   */
  origin: CandidateOriginCatalog | CandidateOriginApplication;
  path: string;
  title: string;
  category: CandidateCategory;
  risk: Risk;
  explanation: string;
  advice: string;
  /** The app or settings pane the person handles the place in; `null` when none opens it. */
  opener: AdviceOpener | null;
  /**
   * The absolute paths inside `path` that other entries offer, so the advice's size holds none of
   * their bytes and the scan lets their offers stand.
   */
  carvedPaths: string[];
  allocatedBytes: number;
  isComplete: boolean;
  privateSizeFallbackCount: number;
  lastUsedAtMs: number | null;
  downloadedAtMs: number | null;
  appName: string | null;
};

export type SkipReason =
  | 'belowSizeThreshold'
  | 'symbolicLink'
  /** It is, holds, or lies in a folder the removal never touches, such as Mail or the deletion log. */
  | 'protectedPath'
  /** It lies outside every folder the removal may take from, such as an evict outside iCloud. */
  | 'outsideAllowedRoot'
  /** Neither a plain file nor a folder, or a folder an evict would take, which takes only files. */
  | 'unsupportedKind'
  | 'systemOwned'
  | 'ownerRunning'
  | 'runningUnknown'
  | 'recentActivity'
  | 'activityUnknown'
  | 'recentUse'
  | 'useUnknown'
  | 'ownerInstalled'
  /** A folder named by a vendor's or a generic word, which tells no single app it belongs to. */
  | 'genericName'
  /** An installer of the release of the system that runs now. */
  | 'installsRunningSystem'
  /** An installer whose release, or the running system's, could not be read. */
  | 'systemVersionUnknown'
  | 'notBundleId'
  | 'installedAppsUnknown'
  | 'holdsOtherVolume'
  | 'overlapsEarlierCandidate'
  /** It holds the path of an explore entry, or holds or lies in what a probe's unit takes. */
  | 'heldByProbe';

export type CandidateDecisionOffer = { kind: 'offer'; candidate: Candidate };

export type CandidateDecisionAdvice = { kind: 'advice'; advice: Advice };

export type CandidateDecisionSkip = { kind: 'skip'; path: string; reason: SkipReason };

export type CandidateDecision =
  | CandidateDecisionOffer
  | CandidateDecisionAdvice
  | CandidateDecisionSkip;

/** Narrows by the origin, which the compiler does not follow down into the candidate. */
export function isProbedCandidate(candidate: Candidate): candidate is CandidateProbed {
  return candidate.origin.kind === 'explore';
}
