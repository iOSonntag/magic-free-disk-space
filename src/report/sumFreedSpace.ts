import type { RemovalOutcome } from '../delete/deleteCandidates.js';

/** The space a run freed, split by when the disk gets it back. */
export type FreedSpace = {
  /** The space the disk got back, every engine's left out. */
  freedBytes: number;
  /** What the engines freed inside their disk images, which the disk gets back only later. */
  returnsLaterBytes: number;
};

export function sumFreedSpace(outcomes: RemovalOutcome[]): FreedSpace {
  return {
    freedBytes: sumFreedBytes(outcomes.filter((outcome) => !isEngineOutcome(outcome))),
    returnsLaterBytes: sumFreedBytes(outcomes.filter(isEngineOutcome)),
  };
}

/** Whether an engine removed the item, inside its disk image, so its space comes back later. */
export function isEngineOutcome(outcome: RemovalOutcome): boolean {
  return outcome.candidate.removal.kind === 'callEngine';
}

function sumFreedBytes(outcomes: RemovalOutcome[]): number {
  return outcomes.reduce((sum, outcome) => sum + outcome.freedBytes, 0);
}
