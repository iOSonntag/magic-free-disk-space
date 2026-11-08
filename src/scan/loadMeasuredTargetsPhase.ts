import { isStrictlyInsidePath } from '../path/isStrictlyInsidePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { EntryReads } from '../system/entryReads.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadPlacedFileIdentity } from '../system/loadPlacedFileIdentity.js';
import { toNonEmpty } from '../system/nonEmptyList.js';
import type { EvictedEntryRecorder } from '../system/walkDirectoryTree.js';
import { buildFailureIssues } from './buildReadIssue.js';
import type { CandidateDecision, RemovalTarget, TargetsMeasurement } from './candidate.js';
import { loadPathMeasurement } from './loadPathMeasurement.js';
import type { ScanPhase } from './scanPhase.js';
import { skipOfferHoldingOtherVolume } from './skipOfferHoldingOtherVolume.js';

/** A path to go as its finder found it, with what else its recheck compares, such as its times. */
export type FoundTarget = { path: string };

/** The absolute paths inside the targets that other entries offer, so the tally holds none of them. */
export type TargetsCarve = { pathRules: PathRules; carvedPaths: string[] };

/**
 * Reads each found path as `entryReads` place it, measures those that are there as one tally, and
 * decides with it. A vanished path is no target, and the phase adds nothing when none is left. An
 * unreadable path adds an issue and no decision; an offer with another mounted volume is skipped.
 */
export function loadMeasuredTargetsPhase<TFound extends FoundTarget>(params: {
  found: [TFound, ...TFound[]];
  /** The tally leaves out each carved subtree inside a target, which keeps its identity. */
  carve: TargetsCarve | null;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  entryReads: EntryReads;
  recordEvictedEntry: EvictedEntryRecorder | null;
  privacyDenialCode: string | null;
  decide: (measurement: TargetsMeasurement<TFound & RemovalTarget>) => Promise<CandidateDecision>;
}): Promise<ScanPhase> {
  return params.runItemMeasurement(async () => {
    const reads = await Promise.all(
      params.found.map(async (found) => ({
        found: found,
        identity: await loadPlacedFileIdentity({
          path: found.path,
          entryReads: params.entryReads,
        }),
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

    const targets = toNonEmpty(
      reads.flatMap((read): (TFound & RemovalTarget)[] =>
        read.identity.kind === 'succeeded'
          ? [{ ...read.found, identity: read.identity.value }]
          : [],
      ),
    );

    if (targets === null) {
      return { decisions: [], issues: [] };
    }

    const targetPaths = targets.map((target) => target.path);
    const { latestModifiedMs, ...tally } = await loadPathMeasurement({
      paths:
        params.carve === null
          ? targetPaths
          : await listUncarvedPaths({ paths: targetPaths, carve: params.carve }),
      deadlineMs: Date.now() + params.measureTimeoutMs,
      entryReads: params.entryReads,
      recordEvictedEntry: params.recordEvictedEntry,
    });

    // No target could be read right after its identity was: each vanished or changed meanwhile.
    // A target that holds nothing but carved paths leaves nothing to measure either.
    if (latestModifiedMs === null) {
      return { decisions: [], issues: [] };
    }

    const measurement: TargetsMeasurement<TFound & RemovalTarget> = {
      ...tally,
      latestModifiedMs: latestModifiedMs,
      targets: targets,
    };
    const decision = skipOfferHoldingOtherVolume({
      decision: await params.decide(measurement),
      measurement: measurement,
    });

    return { decisions: [decision], issues: [] };
  });
}

/**
 * The paths whose trees together hold the targets less the carved subtrees: a target without a
 * carved path inside stays whole, one with a carved path splits into its children, descending
 * only along the way to each carved path. A folder that cannot be listed stays whole, so its tally
 * may hold carved bytes but never misses any of its own.
 */
async function listUncarvedPaths(params: {
  paths: string[];
  carve: TargetsCarve;
}): Promise<string[]> {
  const uncarvedPaths: string[] = [];

  for (const path of params.paths) {
    const carvedInside = params.carve.carvedPaths.filter((carvedPath) =>
      isStrictlyInsidePath({ rules: params.carve.pathRules, path: carvedPath, parentPath: path }),
    );

    if (carvedInside.length === 0) {
      uncarvedPaths.push(path);

      continue;
    }

    const names = await loadDirectoryNames({ path: path });

    if (names.kind === 'failed') {
      uncarvedPaths.push(path);

      continue;
    }

    const childPaths = names.value
      .map((name) => `${path}${params.carve.pathRules.separator}${name}`)
      .filter((childPath) => !carvedInside.includes(childPath));

    uncarvedPaths.push(
      ...(await listUncarvedPaths({
        paths: childPaths,
        carve: { pathRules: params.carve.pathRules, carvedPaths: carvedInside },
      })),
    );
  }

  return uncarvedPaths;
}
