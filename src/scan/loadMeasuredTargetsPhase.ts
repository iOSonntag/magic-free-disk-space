import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { EntryReads } from '../system/entryReads.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import { buildFailureIssues } from './buildReadIssue.js';
import type { CandidateDecision, RemovalTarget, RemovalTargets } from './candidate.js';
import type { Measurement } from './loadPathMeasurement.js';
import { loadPathMeasurement } from './loadPathMeasurement.js';
import type { ScanPhase } from './scanPhase.js';
import { skipOfferHoldingOtherVolume } from './skipOfferHoldingOtherVolume.js';

/** A path to go as its finder found it, with what else its recheck compares, such as its times. */
export type FoundTarget = { path: string };

/** One offer of its targets as a decision reads it: each target with its identity, and one tally. */
export type TargetsMeasurement<TTarget extends RemovalTarget = RemovalTarget> = Omit<
  Measurement,
  'identity'
> & {
  targets: RemovalTargets<TTarget>;
};

/**
 * Reads the identity of each found path, measures those that are there as one tally, and decides
 * with the measurement; for one path, what `loadMeasuredPhase` does. A path that vanished is no
 * target; when none is left, the phase adds nothing. A path that cannot be read adds an issue and
 * the phase no decision, since the offer would not be whole. An offer holding another mounted
 * volume becomes a skip.
 */
export function loadMeasuredTargetsPhase<TFound extends FoundTarget>(params: {
  found: [TFound, ...TFound[]];
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  entryReads: EntryReads;
  privacyDenialCode: string | null;
  decide: (measurement: TargetsMeasurement<TFound & RemovalTarget>) => Promise<CandidateDecision>;
}): Promise<ScanPhase> {
  return params.runItemMeasurement(async () => {
    const reads = await Promise.all(
      params.found.map(async (found) => ({
        found: found,
        identity: await loadFileIdentity({ path: found.path }),
      })),
    );
    const issues = reads.flatMap((read) =>
      read.identity.kind === 'failed'
        ? buildFailureIssues({
            path: read.found.path,
            failure: read.identity.failure,
            privacyDenialCode: params.privacyDenialCode,
          })
        : [],
    );

    if (issues.length > 0) {
      return { decisions: [], issues: issues };
    }

    const [firstTarget, ...otherTargets] = reads.flatMap((read): (TFound & RemovalTarget)[] =>
      read.identity.kind === 'succeeded' ? [{ ...read.found, identity: read.identity.value }] : [],
    );

    if (firstTarget === undefined) {
      return { decisions: [], issues: [] };
    }

    const targets: RemovalTargets<TFound & RemovalTarget> = [firstTarget, ...otherTargets];
    const measured = await loadPathMeasurement({
      paths: targets.map((target) => target.path),
      deadlineMs: Date.now() + params.measureTimeoutMs,
      entryReads: params.entryReads,
    });

    // No target could be read right after its identity was: each vanished or changed meanwhile.
    if (measured.latestModifiedMs === null) {
      return { decisions: [], issues: [] };
    }

    const measurement: TargetsMeasurement<TFound & RemovalTarget> = {
      targets: targets,
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

/** The found form of plain paths, which carry nothing else to compare. */
export function buildFoundTargets(paths: [string, ...string[]]): [FoundTarget, ...FoundTarget[]] {
  const [firstPath, ...otherPaths] = paths;

  return [{ path: firstPath }, ...otherPaths.map((path) => ({ path: path }))];
}

/**
 * True when a target is a symbolic link, which the scan never offers: its deletion would take the
 * link, not the place the rule judged.
 */
export function hasSymbolicLinkTarget(measurement: TargetsMeasurement): boolean {
  return measurement.targets.some((target) => target.identity.kind === 'symbolicLink');
}
