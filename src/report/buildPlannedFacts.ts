import type { Risk } from '../catalog/catalog.js';
import type { RemovalPlan } from '../delete/planRemoval.js';
import type { Candidate } from '../scan/candidate.js';
import type { ItemKey } from '../scan/candidateOrigin.js';
import { buildItemKey } from '../scan/candidateOrigin.js';
import type { CandidateGroup, ConsumerSection } from '../scan/placeCandidate.js';
import { placeCandidate } from '../scan/placeCandidate.js';
import { findRankedNumber } from './findRankedNumber.js';
import { formatDisplayText } from './formatDisplayText.js';
import type { ItemRemovalView } from './itemRemovalView.js';
import { buildItemRemovalView } from './itemRemovalView.js';

export type PlannedItemFacts = {
  number: number;
  key: ItemKey;
  /** Safe to show. */
  title: string;
  sectionKey: ConsumerSection;
  /** The group the scan view shows the item in, so a client never works it out again. */
  group: CandidateGroup;
  risk: Risk;
  /** How the item goes, as the scan view words it: an evicted item stays in iCloud. */
  removal: ItemRemovalView;
  allocatedBytes: number;
  /** False when `allocatedBytes` is a lower bound. */
  isComplete: boolean;
};

/** What a plan deletes, for a client to word its confirmation by. */
export type PlannedFacts = {
  items: PlannedItemFacts[];
  totalBytes: number;
  /** True when an approved item is in the `careful` group: nothing brings it back. */
  holdsCareful: boolean;
};

/** `ranked` is the candidates of the scan the plan was made from, which number its items. */
export function buildPlannedFacts(params: {
  plan: RemovalPlan;
  ranked: Candidate[];
}): PlannedFacts {
  const items = params.plan.approved.map((candidate) =>
    buildPlannedItemFacts({ candidate: candidate, ranked: params.ranked }),
  );

  return {
    items: items,
    totalBytes: items.reduce((sum, item) => sum + item.allocatedBytes, 0),
    holdsCareful: items.some((item) => item.group === 'careful'),
  };
}

function buildPlannedItemFacts(params: {
  candidate: Candidate;
  ranked: Candidate[];
}): PlannedItemFacts {
  const place = placeCandidate(params.candidate);

  return {
    number: findRankedNumber({ ranked: params.ranked, candidate: params.candidate }),
    key: buildItemKey({ item: params.candidate }),
    title: formatDisplayText({ text: params.candidate.title }),
    sectionKey: place.section,
    group: place.group,
    risk: params.candidate.risk,
    removal: buildItemRemovalView({ removal: params.candidate.removal }),
    allocatedBytes: params.candidate.allocatedBytes,
    isComplete: params.candidate.isComplete,
  };
}
