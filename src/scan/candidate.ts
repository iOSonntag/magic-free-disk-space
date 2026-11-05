import type { CandidateCategory, Risk } from '../catalog/catalog.js';
import type { ExplorePathUnit, ExploreToolUnit } from '../explore/exploreUnit.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import type {
  CandidateOrigin,
  CandidateOriginCatalog,
  CandidateOriginExplore,
} from './candidateOrigin.js';

/** Deleted as a path, only while its identity still matches the scan. */
export type CandidateRemovalDeletePath = {
  kind: 'deletePath';
  identity: FileIdentity;
  /** App bundles whose running process withholds the item, checked again right before deletion. */
  ownerBundlePaths: string[];
};

/** Removed by the command of the unit's own tool, after the unit is checked again. */
export type CandidateRemovalRunTool = { kind: 'runTool'; unit: ExploreToolUnit };

/**
 * Deleted as the unit's one folder, after the unit is checked again and only while the folder's
 * identity still matches the scan.
 */
export type CandidateRemovalDeleteUnitFolder = {
  kind: 'deleteUnitFolder';
  identity: FileIdentity;
  unit: ExplorePathUnit;
};

/** What an item is and what it holds, the same for every origin. */
export type CandidateListing = {
  /** The path shown; for a tool item, the place of its unit. */
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
  /** The installed app the item belongs to, by the name the person knows it by. */
  appName: string | null;
};

/** An item a rule matched to a path on disk, deleted as that path. */
export type CandidateMatched = CandidateListing & {
  origin: Exclude<CandidateOrigin, CandidateOriginExplore>;
  removal: CandidateRemovalDeletePath;
};

/** An item a probe of Explore found, removed by the command of its tool or as its unit's folder. */
export type CandidateProbed = CandidateListing & {
  origin: CandidateOriginExplore;
  removal: CandidateRemovalRunTool | CandidateRemovalDeleteUnitFolder;
  /** What the probe found that makes the item safe to offer. */
  evidenceLines: string[];
};

export type Candidate = CandidateMatched | CandidateProbed;

export type Advice = {
  /** Advice comes only from a catalog entry, whose place the person handles with its own tool. */
  origin: CandidateOriginCatalog;
  path: string;
  title: string;
  category: CandidateCategory;
  risk: Risk;
  explanation: string;
  advice: string;
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
  | 'systemOwned'
  | 'ownerRunning'
  | 'runningUnknown'
  | 'recentActivity'
  | 'activityUnknown'
  | 'recentUse'
  | 'useUnknown'
  | 'ownerInstalled'
  | 'notBundleId'
  | 'installedAppsUnknown'
  | 'holdsOtherVolume'
  | 'overlapsEarlierCandidate';

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
