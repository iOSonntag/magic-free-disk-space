import type { Result } from '../result.js';
import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { FileFailure } from '../system/loadFileIdentity.js';
import { buildFailureIssues } from './buildReadIssue.js';
import type { CandidateDecision } from './candidate.js';
import type { Measurement } from './loadPathMeasurement.js';
import { loadPathMeasurement } from './loadPathMeasurement.js';
import type { ScanPhase } from './scanPhase.js';
import { skipOfferHoldingOtherVolume } from './skipOfferHoldingOtherVolume.js';

/**
 * Measures the path within the limit and decides with the measurement. A path that vanished adds
 * nothing; one that cannot be read adds an issue instead of a decision. An offer holding another
 * mounted volume becomes a skip.
 */
export function loadMeasuredPhase(params: {
  path: string;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  decide: (measurement: Measurement) => Promise<CandidateDecision>;
}): Promise<ScanPhase> {
  return params.runItemMeasurement(async () => {
    const measured = await loadPathMeasurement({
      path: params.path,
      deadlineMs: Date.now() + params.measureTimeoutMs,
    });

    return buildMeasuredPhase({ path: params.path, measured: measured, decide: params.decide });
  });
}

async function buildMeasuredPhase(params: {
  path: string;
  measured: Result<Measurement, FileFailure>;
  decide: (measurement: Measurement) => Promise<CandidateDecision>;
}): Promise<ScanPhase> {
  const measured = params.measured;

  if (measured.kind === 'succeeded') {
    const decision = skipOfferHoldingOtherVolume({
      decision: await params.decide(measured.value),
      measurement: measured.value,
    });

    return { decisions: [decision], issues: [] };
  }

  return {
    decisions: [],
    issues: buildFailureIssues({ path: params.path, failure: measured.failure }),
  };
}
