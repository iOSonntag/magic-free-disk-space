import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { EntryReads } from '../system/entryReads.js';
import type { CandidateDecision } from './candidate.js';
import { loadMeasuredTargetsPhase } from './loadMeasuredTargetsPhase.js';
import type { Measurement } from './loadPathMeasurement.js';
import type { ScanPhase } from './scanPhase.js';

/**
 * `loadMeasuredTargetsPhase` for one path, decided with the path's own identity: a path that
 * vanished adds nothing, one that cannot be read an issue, and an offer holding another mounted
 * volume becomes a skip.
 */
export function loadMeasuredPhase(params: {
  path: string;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  entryReads: EntryReads;
  privacyDenialCode: string | null;
  decide: (measurement: Measurement) => Promise<CandidateDecision>;
}): Promise<ScanPhase> {
  return loadMeasuredTargetsPhase({
    found: [{ path: params.path }],
    carve: null,
    measureTimeoutMs: params.measureTimeoutMs,
    runItemMeasurement: params.runItemMeasurement,
    entryReads: params.entryReads,
    privacyDenialCode: params.privacyDenialCode,
    decide: (measurement) =>
      params.decide({
        identity: measurement.targets[0].identity,
        allocatedBytes: measurement.allocatedBytes,
        entryCount: measurement.entryCount,
        unreadableCount: measurement.unreadableCount,
        privateSizeFallbackCount: measurement.privateSizeFallbackCount,
        isComplete: measurement.isComplete,
        latestModifiedMs: measurement.latestModifiedMs,
        holdsOtherVolume: measurement.holdsOtherVolume,
      }),
  });
}
