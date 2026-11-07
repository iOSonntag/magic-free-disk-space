import type { Advice, Candidate } from './candidate.js';
import type { ConsumerSection } from './placeCandidate.js';
import { CONSUMER_SECTION_ORDER, getCategorySection, placeCandidate } from './placeCandidate.js';

/**
 * What one section holds: its offered items, those of Explore by their category, and the count of
 * its advice, whose size the person frees with its own tool and so is no part of the bytes.
 */
export type SectionTotal = {
  sectionKey: ConsumerSection;
  allocatedBytes: number;
  /** False when the size of an item of the section is a lower bound. */
  isComplete: boolean;
  itemCount: number;
  /** The bytes of the section's `safe` group. */
  safeBytes: number;
  adviceCount: number;
};

/** The sections that hold an item or advice, top to bottom. */
export function buildSectionTotals(params: {
  candidates: Candidate[];
  advice: Advice[];
}): SectionTotal[] {
  const placedCandidates = params.candidates.map((candidate) => ({
    candidate: candidate,
    place: placeCandidate(candidate),
  }));

  return CONSUMER_SECTION_ORDER.flatMap((section) => {
    const sectionCandidates = placedCandidates.filter((placed) => placed.place.section === section);
    const adviceCount = params.advice.filter(
      (advice) => getCategorySection({ category: advice.category }) === section,
    ).length;

    if (sectionCandidates.length === 0 && adviceCount === 0) {
      return [];
    }

    const total: SectionTotal = {
      sectionKey: section,
      allocatedBytes: sumAllocatedBytes({
        candidates: sectionCandidates.map((placed) => placed.candidate),
      }),
      isComplete: sectionCandidates.every((placed) => placed.candidate.isComplete),
      itemCount: sectionCandidates.length,
      safeBytes: sumAllocatedBytes({
        candidates: sectionCandidates
          .filter((placed) => placed.place.group === 'safe')
          .map((placed) => placed.candidate),
      }),
      adviceCount: adviceCount,
    };

    return [total];
  });
}

function sumAllocatedBytes(params: { candidates: Candidate[] }): number {
  return params.candidates.reduce((sum, candidate) => sum + candidate.allocatedBytes, 0);
}
