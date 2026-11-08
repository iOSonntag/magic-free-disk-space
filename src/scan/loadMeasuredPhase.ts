import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { EntryReads } from '../system/entryReads.js';
import type { EvictedEntryRecorder } from '../system/walkDirectoryTree.js';
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
  recordEvictedEntry: EvictedEntryRecorder | null;
  privacyDenialCode: string | null;
  decide: (measurement: Measurement) => Promise<CandidateDecision>;
}): Promise<ScanPhase> {
  return loadMeasuredTargetsPhase({
    found: [{ path: params.path }],
    carve: null,
    measureTimeoutMs: params.measureTimeoutMs,
    runItemMeasurement: params.runItemMeasurement,
    entryReads: params.entryReads,
    recordEvictedEntry: params.recordEvictedEntry,
    privacyDenialCode: params.privacyDenialCode,
    decide: (measurement) => {
      const { targets, ...tally } = measurement;

      return params.decide({ ...tally, identity: targets[0].identity });
    },
  });
}
