import type { Risk } from '../catalog/catalog.js';
import type { RemovalPlan } from '../delete/planRemoval.js';
import type { Candidate } from '../scan/candidate.js';
import type { ItemKey } from '../scan/candidateOrigin.js';
import { buildItemKey } from '../scan/candidateOrigin.js';
import type { ConsumerSection } from '../scan/placeCandidate.js';
import { placeCandidate } from '../scan/placeCandidate.js';
import { findRankedNumber } from './findRankedNumber.js';
import { formatDisplayText } from './formatDisplayText.js';

export type PlannedItemFacts = {
  number: number;
  key: ItemKey;
  /** Safe to show. */
  title: string;
  sectionKey: ConsumerSection;
  risk: Risk;
  allocatedBytes: number;
};

/** What a plan deletes, for a client to word its confirmation by. */
export type PlannedFacts = {
  items: PlannedItemFacts[];
  totalBytes: number;
  /** True when an approved item is `careful`: nothing brings it back. */
  holdsCareful: boolean;
};

/** `ranked` is the candidates of the scan the plan was made from, which number its items. */
export function buildPlannedFacts(params: {
  plan: RemovalPlan;
  ranked: Candidate[];
}): PlannedFacts {
  return {
    items: params.plan.approved.map((candidate) => ({
      number: findRankedNumber({ ranked: params.ranked, candidate: candidate }),
      key: buildItemKey({ item: candidate }),
      title: formatDisplayText({ text: candidate.title }),
      sectionKey: placeCandidate(candidate).section,
      risk: candidate.risk,
      allocatedBytes: candidate.allocatedBytes,
    })),
    totalBytes: params.plan.approved.reduce((sum, candidate) => sum + candidate.allocatedBytes, 0),
    holdsCareful: params.plan.approved.some(
      (candidate) => placeCandidate(candidate).group === 'careful',
    ),
  };
}
