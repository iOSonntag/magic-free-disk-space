import type { Candidate } from '../scan/candidate.js';

/**
 * The number of a candidate of a plan or a run in the ranking of its scan, the same object, since
 * a plan approves and a run outcome carries the candidates of the ranking as they are. Throws for
 * a candidate outside the ranking, which is a broken invariant of the caller.
 */
export function getRankedNumber(params: { ranked: Candidate[]; candidate: Candidate }): number {
  const index = params.ranked.indexOf(params.candidate);

  if (index === -1) {
    throw new Error('A planned or deleted candidate is not part of the ranking of its scan');
  }

  return index + 1;
}
