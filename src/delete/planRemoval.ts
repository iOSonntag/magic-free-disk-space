import type { Environment } from '../environment/buildEnvironment.js';
import type { Candidate } from '../scan/candidate.js';
import type { RefusalReason } from './validateRemoval.js';
import { validateRemoval } from './validateRemoval.js';

export type RefusedRemoval = {
  path: string;
  number: number;
  reason: RefusalReason;
};

export type RemovalPlan = {
  approved: Candidate[];
  refused: RefusedRemoval[];
};

/** Throws on a number outside `ranked`: the selection must be checked against the ranking first. */
export function planRemoval(params: {
  ranked: Candidate[];
  selectedNumbers: number[];
  environment: Environment;
}): RemovalPlan {
  const selectedNumbers = new Set(params.selectedNumbers);

  for (const number of selectedNumbers) {
    if (!Number.isInteger(number) || number < 1 || number > params.ranked.length) {
      throw new Error(
        `Selected number ${number} is outside the ranking of ${params.ranked.length}`,
      );
    }
  }

  const approved: Candidate[] = [];
  const refused: RefusedRemoval[] = [];

  for (const [index, candidate] of params.ranked.entries()) {
    const number = index + 1;

    if (!selectedNumbers.has(number)) {
      continue;
    }

    const decision = validateRemoval({ candidate: candidate, environment: params.environment });

    if (decision.kind === 'approved') {
      approved.push(decision.candidate);
    } else {
      refused.push({ path: decision.path, number: number, reason: decision.reason });
    }
  }

  return { approved: approved, refused: refused };
}
