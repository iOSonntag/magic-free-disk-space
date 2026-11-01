import type { Candidate } from './candidate.js';
import type { CandidatePlace } from './placeCandidate.js';
import { compareCandidatePlaces, placeCandidate } from './placeCandidate.js';

type SizedItem = { path: string; allocatedBytes: number };

type PlacedCandidate = { candidate: Candidate; place: CandidatePlace };

/**
 * Returns a new array, largest `allocatedBytes` first.
 * Equal sizes sort by `path` with plain `<`.
 */
export function rankBySize<TItem extends SizedItem>(params: { items: TItem[] }): TItem[] {
  return params.items.toSorted(compareBySize);
}

/**
 * Returns a new array in the order of their places, top to bottom with Explore last, and within
 * one place in the order of `rankBySize`.
 */
export function rankByPlace(params: { candidates: Candidate[] }): Candidate[] {
  const placedCandidates = params.candidates.map(
    (candidate): PlacedCandidate => ({ candidate: candidate, place: placeCandidate(candidate) }),
  );

  return placedCandidates
    .toSorted(comparePlacedCandidates)
    .map((placedCandidate) => placedCandidate.candidate);
}

function comparePlacedCandidates(left: PlacedCandidate, right: PlacedCandidate): number {
  const placeOrder = compareCandidatePlaces(left.place, right.place);

  if (placeOrder !== 0) {
    return placeOrder;
  }

  return compareBySize(left.candidate, right.candidate);
}

function compareBySize(left: SizedItem, right: SizedItem): number {
  if (left.allocatedBytes !== right.allocatedBytes) {
    return right.allocatedBytes - left.allocatedBytes;
  }

  if (left.path < right.path) {
    return -1;
  }

  if (left.path > right.path) {
    return 1;
  }

  return 0;
}
