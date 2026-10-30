import type { CandidateCategory, Risk } from '../catalog/catalog.js';
import type { ExploreToolUnit } from '../explore/exploreUnit.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';

/** Deleted as a path, only while its identity still matches the scan. */
export type CandidateRemovalDeletePath = {
  kind: 'deletePath';
  identity: FileIdentity;
  /** App bundles whose running process withholds the item, checked again right before deletion. */
  ownerBundlePaths: string[];
};

/** Removed by the command of the unit's own tool, after the unit is checked again. */
export type CandidateRemovalRunTool = { kind: 'runTool'; unit: ExploreToolUnit };

export type CandidateRemoval = CandidateRemovalDeletePath | CandidateRemovalRunTool;

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
};

/** An item a rule matched to a path on disk, deleted as that path. */
export type CandidateMatched = CandidateListing & {
  origin: 'catalog' | 'artifact' | 'application' | 'userFile' | 'leftover';
  removal: CandidateRemovalDeletePath;
};

/** An item a probe of Explore found, removed by the command of its tool. */
export type CandidateProbed = CandidateListing & {
  origin: 'explore';
  removal: CandidateRemovalRunTool;
  /** What the probe found that makes the item safe to offer. */
  evidenceLines: string[];
};

export type Candidate = CandidateMatched | CandidateProbed;

export type Advice = {
  path: string;
  title: string;
  category: CandidateCategory;
  risk: Risk;
  explanation: string;
  advice: string;
  allocatedBytes: number;
  isComplete: boolean;
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
