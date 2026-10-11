import type { CandidateCategory, Risk } from '../catalog/catalog.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';

export type CandidateOrigin = 'catalog' | 'artifact' | 'application' | 'userFile' | 'leftover';

export type Candidate = {
  path: string;
  identity: FileIdentity;
  title: string;
  category: CandidateCategory;
  risk: Risk;
  origin: CandidateOrigin;
  explanation: string;
  regeneration: string;
  allocatedBytes: number;
  entryCount: number;
  /** False when the size is a lower bound: unreadable entries or a deadline. */
  isComplete: boolean;
  /** App bundles whose running process withholds the item, checked again right before deletion. */
  ownerBundlePaths: string[];
};

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
  | 'overlapsEarlierCandidate';

export type CandidateDecisionOffer = { kind: 'offer'; candidate: Candidate };

export type CandidateDecisionAdvice = { kind: 'advice'; advice: Advice };

export type CandidateDecisionSkip = { kind: 'skip'; path: string; reason: SkipReason };

export type CandidateDecision =
  | CandidateDecisionOffer
  | CandidateDecisionAdvice
  | CandidateDecisionSkip;
