import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { EntryReads } from '../system/entryReads.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
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
  entryReads: EntryReads;
  privacyDenialCode: string | null;
  decide: (measurement: Measurement) => Promise<CandidateDecision>;
}): Promise<ScanPhase> {
  return params.runItemMeasurement(async () => {
    const identity = await loadFileIdentity({ path: params.path });

    if (identity.kind === 'failed') {
      return {
        decisions: [],
        issues: buildFailureIssues({
          path: params.path,
          failure: identity.failure,
          privacyDenialCode: params.privacyDenialCode,
        }),
      };
    }

    const measured = await loadPathMeasurement({
      paths: [params.path],
      deadlineMs: Date.now() + params.measureTimeoutMs,
      entryReads: params.entryReads,
    });

    // The root could not be read right after its identity was: it vanished or changed meanwhile.
    if (measured.latestModifiedMs === null) {
      return { decisions: [], issues: [] };
    }

    const measurement: Measurement = {
      identity: identity.value,
      allocatedBytes: measured.allocatedBytes,
      entryCount: measured.entryCount,
      unreadableCount: measured.unreadableCount,
      privateSizeFallbackCount: measured.privateSizeFallbackCount,
      isComplete: measured.isComplete,
      latestModifiedMs: measured.latestModifiedMs,
      holdsOtherVolume: measured.holdsOtherVolume,
    };
    const decision = skipOfferHoldingOtherVolume({
      decision: await params.decide(measurement),
      measurement: measurement,
    });

    return { decisions: [decision], issues: [] };
  });
}
