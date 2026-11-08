import type { RemovalOutcomeKind } from './deleteCandidates.js';
import { isGoneOutcome } from './isGoneOutcome.js';

/** Every target is gone: `removed` when one went by this run, `alreadyGone` when none did. */
export type TargetsOutcomeDecisionGone = { kind: 'gone'; outcome: 'removed' | 'alreadyGone' };

/** The first target that is not gone, which names the outcome of its item. */
export type TargetsOutcomeDecisionStayed<TTarget> = { kind: 'stayed'; target: TTarget };

export type TargetsOutcomeDecision<TTarget> =
  | TargetsOutcomeDecisionGone
  | TargetsOutcomeDecisionStayed<TTarget>;

/** What the outcomes of an item's targets, each read through `getOutcome`, make of the item. */
export function decideTargetsOutcome<TTarget>(params: {
  targets: [TTarget, ...TTarget[]];
  getOutcome: (target: TTarget) => RemovalOutcomeKind;
}): TargetsOutcomeDecision<TTarget> {
  const stayedTarget = params.targets.find((target) => !isGoneOutcome(params.getOutcome(target)));

  if (stayedTarget !== undefined) {
    return { kind: 'stayed', target: stayedTarget };
  }

  const hasRemoved = params.targets.some((target) => params.getOutcome(target) === 'removed');

  return { kind: 'gone', outcome: hasRemoved ? 'removed' : 'alreadyGone' };
}
