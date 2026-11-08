import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreProbePlatform } from '../explore/exploreProbe.js';
import type { ExploreProbeFailure } from '../explore/exploreUnit.js';
import { buildUnitRunArguments, listEngineUnitIds } from '../explore/exploreUnit.js';
import { recheckExplorePathUnit } from '../explore/recheckExploreUnit.js';
import type { PathRules } from '../path/pathRules.js';
import type {
  Candidate,
  CandidateRemovalDeletePaths,
  CandidateRemovalDeleteUnitPaths,
  RemovalTarget,
  RemovalTargets,
} from '../scan/candidate.js';
import { SCAN_LIMITS } from '../scan/limits.js';
import { getMeasuredFreedBytes, loadPathMeasurement } from '../scan/loadPathMeasurement.js';
import { resolveRemovalOwnerState } from '../scan/resolveOwnerState.js';
import type { EntryReads } from '../system/entryReads.js';
import type { FileFailure, FileIdentity } from '../system/loadFileIdentity.js';
import { getFileFailure, loadFileIdentity } from '../system/loadFileIdentity.js';
import { mapNonEmpty, mapNonEmptyInTurn } from '../system/nonEmptyList.js';
import type { ReadFailure } from '../system/readFailure.js';
import type { RunningProcesses } from '../system/systemPlatform.js';
import { callEngineCandidate } from './callEngineCandidate.js';
import { decideTargetsOutcome } from './decideTargetsOutcome.js';
import type { DeletePlatform, TreeRemoval } from './deletePlatform.js';
import type { DeletionJournal, JournalEntry, JournalFailure } from './deletionJournal.js';
import { emptyRecycleBinCandidate } from './emptyRecycleBinCandidate.js';
import { evictCandidateFiles } from './evictCandidateFiles.js';
import { fileFailureToOutcome } from './fileFailureToOutcome.js';
import type { ToolCandidateRun } from './runToolCandidate.js';
import { runToolCandidate, TOOL_RUN_TIMEOUT_MS } from './runToolCandidate.js';

export type RemovalOutcomeKind =
  | 'removed'
  | 'partlyRemoved'
  | 'alreadyGone'
  | 'changedSinceScan'
  | 'ownerRunning'
  | 'permissionDenied'
  | 'failed'
  | 'notAttempted'
  | 'toolFailed'
  /** The engine refused to remove a unit it still uses; the item stays, as no failure. */
  | 'engineInUse'
  /** The engine's socket was gone or refused the connect, so nothing was sent; the item stays. */
  | 'engineNotRunning';

/** The outcomes that carry an error code rather than a tool failure or the entries that stayed. */
export type RemovalOutcomeCodedKind = Exclude<RemovalOutcomeKind, 'toolFailed' | 'partlyRemoved'>;

export type RemovalOutcomeCoded = {
  candidate: Candidate;
  /**
   * The space this run gave back: the scanned size of the targets it found and deleted, the
   * measured drop of an item whose targets went only in part, a tool run's measured drop, the
   * blocks of the files an evict took, or what an engine reports it freed.
   */
  freedBytes: number;
  outcome: RemovalOutcomeCodedKind;
  /** The error code of the failed file call, else `null`. */
  code: string | null;
};

/** A tool that failed may still have removed part of its unit, which `freedBytes` holds. */
export type RemovalOutcomeToolFailed = {
  candidate: Candidate;
  freedBytes: number;
  outcome: 'toolFailed';
  failure: ExploreProbeFailure;
};

/**
 * An item whose removal left entries of a target that another program held, or whose content only
 * a cloud store keeps; `freedBytes` is the drop to what a measurement after the removal still
 * found, and `stayedEntryCount` the entries left of every target its removal left in part.
 */
export type RemovalOutcomePartlyRemoved = {
  candidate: Candidate;
  freedBytes: number;
  outcome: 'partlyRemoved';
  stayedEntryCount: number;
};

/** The outcome of an item deleted as its targets. */
type TargetsRemovalOutcome = RemovalOutcomeCoded | RemovalOutcomePartlyRemoved;

export type RemovalOutcome = TargetsRemovalOutcome | RemovalOutcomeToolFailed;

export type RemovalRun = {
  outcomes: RemovalOutcome[];
  journalFailure: JournalFailure | null;
};

/** Whether the outcome left its item in place through a failure, which the run reports. */
export function isUnremovedOutcome(kind: RemovalOutcomeKind): boolean {
  switch (kind) {
    case 'partlyRemoved':
    case 'permissionDenied':
    case 'failed':
    case 'toolFailed':
      return true;
    case 'removed':
    case 'alreadyGone':
    case 'changedSinceScan':
    case 'ownerRunning':
    case 'notAttempted':
    case 'engineInUse':
    case 'engineNotRunning':
      return false;
  }
}

/**
 * Removes each candidate permanently, in order, after recording the intent, and records the
 * outcome entries after it. A target goes only while its identity still matches the scan, its
 * content is still on this computer, and no owner runs in the processes
 * `loadKnownRunningProcesses` read once after the confirmation; `null` withholds every owned item.
 * A tool item, a unit deleted as its paths, an evict, and an engine's unit are checked again first
 * and go only while the unit is still unchanged and idle. A Recycle Bin is emptied only while it
 * holds what the scan counted. A journal failure stops the run.
 */
export async function deleteCandidates(params: {
  candidates: Candidate[];
  journal: DeletionJournal;
  environment: Environment;
  /** The delete slice, whose `removeTree` removes each path and whose `trash` empties a bin. */
  delete: DeletePlatform;
  /** What the rechecks of the units read by. */
  probePlatform: ExploreProbePlatform;
  /** The system slice's entry reads, for measuring around a tool's run and a failed removal. */
  entryReads: EntryReads;
  loadKnownRunningProcesses: () => Promise<RunningProcesses | null>;
  clock: () => number;
}): Promise<RemovalRun> {
  const runningProcesses = await params.loadKnownRunningProcesses();
  const outcomes: RemovalOutcome[] = [];

  for (const [index, candidate] of params.candidates.entries()) {
    const intentRecorded = await params.journal.append({
      entry: buildIntentEntry({ candidate: candidate, atMs: params.clock() }),
    });

    if (intentRecorded.kind === 'failed') {
      return {
        outcomes: [
          ...outcomes,
          ...buildNotAttemptedOutcomes({ candidates: params.candidates.slice(index) }),
        ],
        journalFailure: intentRecorded.failure,
      };
    }

    const removal = await removeCandidate({
      candidate: candidate,
      environment: params.environment,
      delete: params.delete,
      probePlatform: params.probePlatform,
      entryReads: params.entryReads,
      runningProcesses: runningProcesses,
      loadKnownRunningProcesses: params.loadKnownRunningProcesses,
      clock: params.clock,
    });

    outcomes.push(removal.outcome);

    const outcomeFailure = await appendOutcomeEntries({
      journal: params.journal,
      entries: removal.outcomeEntries,
    });

    if (outcomeFailure !== null) {
      return {
        outcomes: [
          ...outcomes,
          ...buildNotAttemptedOutcomes({ candidates: params.candidates.slice(index + 1) }),
        ],
        journalFailure: outcomeFailure,
      };
    }
  }

  return { outcomes: outcomes, journalFailure: null };
}

/** Appends the entries in order; the first that fails stops the rest. */
async function appendOutcomeEntries(params: {
  journal: DeletionJournal;
  entries: JournalEntry[];
}): Promise<JournalFailure | null> {
  for (const entry of params.entries) {
    const recorded = await params.journal.append({ entry: entry });

    if (recorded.kind === 'failed') {
      return recorded.failure;
    }
  }

  return null;
}

function buildIntentEntry(params: { candidate: Candidate; atMs: number }): JournalEntry {
  switch (params.candidate.removal.kind) {
    case 'deletePaths':
    case 'deleteUnitPaths':
      return {
        kind: 'intent',
        atMs: params.atMs,
        path: params.candidate.path,
        allocatedBytes: params.candidate.allocatedBytes,
        targetPaths: params.candidate.removal.targets.map((target) => target.path),
      };
    // The system empties the bin as one unit, which its outcome entry records at the bin's path.
    case 'emptyRecycleBin':
      return {
        kind: 'intent',
        atMs: params.atMs,
        path: params.candidate.path,
        allocatedBytes: params.candidate.allocatedBytes,
        targetPaths: [params.candidate.path],
      };
    case 'evictUnitFiles':
      return {
        kind: 'evictIntent',
        atMs: params.atMs,
        folderPath: params.candidate.removal.unit.folderPath,
        targetPaths: params.candidate.removal.targets.map((target) => target.path),
      };
    case 'callEngine':
      return {
        kind: 'engineIntent',
        atMs: params.atMs,
        engineName: params.candidate.removal.unit.engineName,
        unitKind: params.candidate.removal.unit.kind,
        unitIds: listEngineUnitIds(params.candidate.removal.unit),
      };
    case 'runTool':
      return {
        kind: 'toolIntent',
        atMs: params.atMs,
        path: params.candidate.path,
        allocatedBytes: params.candidate.allocatedBytes,
        unit: params.candidate.removal.unit,
        args: buildUnitRunArguments(params.candidate.removal.unit),
      };
  }
}

async function removeCandidate(params: {
  candidate: Candidate;
  environment: Environment;
  delete: DeletePlatform;
  probePlatform: ExploreProbePlatform;
  entryReads: EntryReads;
  /** The processes read once before the run, for path items. */
  runningProcesses: RunningProcesses | null;
  loadKnownRunningProcesses: () => Promise<RunningProcesses | null>;
  clock: () => number;
}): Promise<RecordedRemoval> {
  switch (params.candidate.removal.kind) {
    case 'deletePaths':
      return deletePathsCandidate({
        candidate: params.candidate,
        removal: params.candidate.removal,
        pathRules: params.environment.pathRules,
        delete: params.delete,
        entryReads: params.entryReads,
        runningProcesses: params.runningProcesses,
        clock: params.clock,
      });
    case 'deleteUnitPaths':
      return deleteUnitPathsCandidate({
        candidate: params.candidate,
        removal: params.candidate.removal,
        environment: params.environment,
        delete: params.delete,
        probePlatform: params.probePlatform,
        entryReads: params.entryReads,
        loadKnownRunningProcesses: params.loadKnownRunningProcesses,
        clock: params.clock,
      });
    case 'evictUnitFiles':
      return evictCandidateFiles({
        candidate: params.candidate,
        removal: params.candidate.removal,
        environment: params.environment,
        toolProcesses: params.probePlatform.toolProcesses,
        clock: params.clock,
      });
    case 'callEngine':
      return callEngineCandidate({
        candidate: params.candidate,
        removal: params.candidate.removal,
        user: params.environment.user,
        clock: params.clock,
      });
    case 'emptyRecycleBin':
      return emptyRecycleBinCandidate({
        candidate: params.candidate,
        removal: params.candidate.removal,
        trash: params.delete.trash,
        clock: params.clock,
      });
    case 'runTool': {
      const run = await runToolCandidate({
        unit: params.candidate.removal.unit,
        environment: params.environment,
        probePlatform: params.probePlatform,
        entryReads: params.entryReads,
        loadKnownRunningProcesses: params.loadKnownRunningProcesses,
        timeoutMs: TOOL_RUN_TIMEOUT_MS,
      });

      return toolCandidateRunToRemoval({
        candidate: params.candidate,
        run: run,
        atMs: params.clock(),
      });
    }
  }
}

/**
 * The outcome of a removal and the journal entries that record it, in the order they happened: one
 * per target of an item of paths or an evict, one for a tool's run, an engine's call, or a
 * Recycle Bin.
 */
export type RecordedRemoval = {
  outcome: RemovalOutcome;
  outcomeEntries: [JournalEntry, ...JournalEntry[]];
};

/** Maps the run of a tool item onto its outcome and its `toolOutcome` journal entry. */
export function toolCandidateRunToRemoval(params: {
  candidate: Candidate;
  run: ToolCandidateRun;
  atMs: number;
}): RecordedRemoval {
  switch (params.run.kind) {
    case 'completed':
      return {
        outcome: {
          candidate: params.candidate,
          freedBytes: params.run.freedBytes,
          outcome: 'removed',
          code: null,
        },
        outcomeEntries: [
          {
            kind: 'toolOutcome',
            atMs: params.atMs,
            path: params.candidate.path,
            outcome: 'removed',
            exitCode: 0,
            stderrTail: params.run.stderrTail,
            freedBytes: params.run.freedBytes,
          },
        ],
      };
    case 'skipped':
      return {
        outcome: {
          candidate: params.candidate,
          freedBytes: 0,
          outcome: params.run.reason,
          code: null,
        },
        outcomeEntries: [
          {
            kind: 'toolOutcome',
            atMs: params.atMs,
            path: params.candidate.path,
            outcome: params.run.reason,
          },
        ],
      };
    case 'failed':
      return {
        outcome: {
          candidate: params.candidate,
          freedBytes: params.run.freedBytes,
          outcome: 'toolFailed',
          failure: params.run.failure,
        },
        outcomeEntries: [
          {
            kind: 'toolOutcome',
            atMs: params.atMs,
            path: params.candidate.path,
            outcome: 'toolFailed',
            freedBytes: params.run.freedBytes,
            failure: params.run.failure,
          },
        ],
      };
  }
}

async function deletePathsCandidate(params: {
  candidate: Candidate;
  removal: CandidateRemovalDeletePaths;
  pathRules: PathRules;
  delete: DeletePlatform;
  entryReads: EntryReads;
  runningProcesses: RunningProcesses | null;
  clock: () => number;
}): Promise<RecordedRemoval> {
  const ownerState = resolveRemovalOwnerState({
    owner: params.removal.owner,
    pathRules: params.pathRules,
    runningProcesses: params.runningProcesses,
  });

  switch (ownerState) {
    // An owner that cannot be checked withholds the item as one that runs.
    case 'running':
    case 'unknown':
      return buildKeptRemoval({
        candidate: params.candidate,
        targets: params.removal.targets,
        outcome: 'ownerRunning',
        code: null,
        atMs: params.clock(),
      });
    case 'stopped':
      return deleteScannedTargets({
        candidate: params.candidate,
        targets: params.removal.targets,
        delete: params.delete,
        entryReads: params.entryReads,
        clock: params.clock,
      });
  }
}

/**
 * Deletes the unit's paths only while a fresh recheck, with the processes read right before,
 * still offers the unit for the same reason, and each path's identity still matches the scan.
 */
async function deleteUnitPathsCandidate(params: {
  candidate: Candidate;
  removal: CandidateRemovalDeleteUnitPaths;
  environment: Environment;
  delete: DeletePlatform;
  probePlatform: ExploreProbePlatform;
  entryReads: EntryReads;
  loadKnownRunningProcesses: () => Promise<RunningProcesses | null>;
  clock: () => number;
}): Promise<RecordedRemoval> {
  const recheck = await recheckExplorePathUnit({
    unit: params.removal.unit,
    environment: params.environment,
    platform: params.probePlatform,
    runningProcesses: await params.loadKnownRunningProcesses(),
  });

  switch (recheck.kind) {
    case 'changed':
      return buildKeptRemoval({
        candidate: params.candidate,
        targets: params.removal.targets,
        outcome: 'changedSinceScan',
        code: null,
        atMs: params.clock(),
      });
    case 'busy':
      return buildKeptRemoval({
        candidate: params.candidate,
        targets: params.removal.targets,
        outcome: 'ownerRunning',
        code: null,
        atMs: params.clock(),
      });
    case 'failed':
      return buildKeptRemoval({
        candidate: params.candidate,
        targets: params.removal.targets,
        outcome: readFailureToOutcomeKind(recheck.failure.failure),
        code: recheck.failure.failure.code,
        atMs: params.clock(),
      });
    case 'unchanged':
      return deleteScannedTargets({
        candidate: params.candidate,
        targets: params.removal.targets,
        delete: params.delete,
        entryReads: params.entryReads,
        clock: params.clock,
      });
  }
}

/** Every target stays, for one reason found before any was touched; one entry per target. */
function buildKeptRemoval(params: {
  candidate: Candidate;
  targets: RemovalTargets<RemovalTarget>;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
  atMs: number;
}): RecordedRemoval {
  return {
    outcome: {
      candidate: params.candidate,
      freedBytes: 0,
      outcome: params.outcome,
      code: params.code,
    },
    outcomeEntries: mapNonEmpty(params.targets, (target) => ({
      kind: 'outcome',
      atMs: params.atMs,
      path: target.path,
      outcome: params.outcome,
      code: params.code,
    })),
  };
}

function readFailureToOutcomeKind(failure: ReadFailure): RemovalOutcomeCodedKind {
  switch (failure.reason) {
    // The outcome shows the code, which already tells a privacy denial from a POSIX one.
    case 'privacyDenied':
    case 'permissionDenied':
      return 'permissionDenied';
    case 'inUse':
    case 'unexpected':
      return 'failed';
  }
}

/** What became of one target, and whether its delete ran, which may have taken part of it. */
type TargetOutcomeCoded = {
  path: string;
  atMs: number;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
  deleteRan: boolean;
};

/** The target's delete ran and left `stayedEntryCount` of its entries where they were. */
type TargetOutcomePartlyRemoved = {
  path: string;
  atMs: number;
  outcome: 'partlyRemoved';
  stayedEntryCount: number;
  deleteRan: true;
};

type TargetOutcome = TargetOutcomeCoded | TargetOutcomePartlyRemoved;

/**
 * Deletes each target in turn, each only while its identity still matches the scan, so a target
 * that stays keeps none of the others from going; one entry per target.
 */
async function deleteScannedTargets(params: {
  candidate: Candidate;
  targets: RemovalTargets<RemovalTarget>;
  delete: DeletePlatform;
  entryReads: EntryReads;
  clock: () => number;
}): Promise<RecordedRemoval> {
  const presentBytes = await loadPresentTargetsBytes({
    candidate: params.candidate,
    targets: params.targets,
    entryReads: params.entryReads,
  });
  const targetOutcomes = await mapNonEmptyInTurn(params.targets, (target) =>
    deleteScannedTarget({
      target: target,
      delete: params.delete,
      entryReads: params.entryReads,
      clock: params.clock,
    }),
  );

  return {
    outcome: await loadTargetsOutcome({
      candidate: params.candidate,
      targetOutcomes: targetOutcomes,
      presentBytes: presentBytes,
      entryReads: params.entryReads,
    }),
    outcomeEntries: mapNonEmpty(targetOutcomes, targetOutcomeToJournalEntry),
  };
}

function targetOutcomeToJournalEntry(targetOutcome: TargetOutcome): JournalEntry {
  switch (targetOutcome.outcome) {
    case 'partlyRemoved':
      return {
        kind: 'outcome',
        atMs: targetOutcome.atMs,
        path: targetOutcome.path,
        outcome: 'partlyRemoved',
        stayedEntryCount: targetOutcome.stayedEntryCount,
      };
    case 'removed':
    case 'alreadyGone':
    case 'changedSinceScan':
    case 'ownerRunning':
    case 'permissionDenied':
    case 'failed':
    case 'notAttempted':
    case 'engineInUse':
    case 'engineNotRunning':
      return {
        kind: 'outcome',
        atMs: targetOutcome.atMs,
        path: targetOutcome.path,
        outcome: targetOutcome.outcome,
        code: targetOutcome.code,
      };
  }
}

/**
 * What the targets still there before the run hold, as the scan measures them: the scanned size
 * while each is there, 0 when none is, else a fresh measurement of those still there, so a target
 * gone before the run counts as nothing this run freed.
 */
async function loadPresentTargetsBytes(params: {
  candidate: Candidate;
  targets: RemovalTargets<RemovalTarget>;
  entryReads: EntryReads;
}): Promise<number> {
  const presentPaths = await listPresentTargetPaths({ targets: params.targets });

  if (presentPaths.length === params.targets.length) {
    return params.candidate.allocatedBytes;
  }

  if (presentPaths.length === 0) {
    return 0;
  }

  const present = await loadPathMeasurement({
    paths: presentPaths,
    deadlineMs: Date.now() + SCAN_LIMITS.measureTimeoutMs,
    entryReads: params.entryReads,
    recordEvictedEntry: null,
  });

  return present.allocatedBytes;
}

/** The paths of the targets that are not missing; one that cannot be read counts as there. */
async function listPresentTargetPaths(params: { targets: RemovalTarget[] }): Promise<string[]> {
  const presentPaths: string[] = [];

  for (const target of params.targets) {
    const identity = await loadFileIdentity({ path: target.path });

    if (identity.kind === 'succeeded' || isPresentDespiteFailure(identity.failure)) {
      presentPaths.push(target.path);
    }
  }

  return presentPaths;
}

/**
 * Whether a target whose identity could not be read is still there, as all but a missing one are.
 */
function isPresentDespiteFailure(failure: FileFailure): boolean {
  switch (failure.reason) {
    case 'missing':
      return false;
    case 'permissionDenied':
    case 'inUse':
    case 'unexpected':
      return true;
  }
}

/**
 * Deletes the target only while its identity still matches the scan and its content is still on
 * this computer: one a cloud store took since the scan keeps only its placeholder here, and
 * deleting that would delete the file in the cloud. One whose placement cannot be read stays,
 * with the code of that read.
 */
async function deleteScannedTarget(params: {
  target: RemovalTarget;
  delete: DeletePlatform;
  entryReads: EntryReads;
  clock: () => number;
}): Promise<TargetOutcome> {
  const currentIdentity = await loadFileIdentity({ path: params.target.path });

  if (currentIdentity.kind === 'failed') {
    const failedOutcome = fileFailureToOutcome(currentIdentity.failure);

    return {
      path: params.target.path,
      atMs: params.clock(),
      outcome: failedOutcome.outcome,
      code: failedOutcome.code,
      deleteRan: false,
    };
  }

  if (!isSameIdentity({ current: currentIdentity.value, scanned: params.target.identity })) {
    return {
      path: params.target.path,
      atMs: params.clock(),
      outcome: 'changedSinceScan',
      code: null,
      deleteRan: false,
    };
  }

  const placement = params.entryReads.loadEntryPlacement({
    path: params.target.path,
    kind: params.target.identity.kind,
  });

  switch (placement.kind) {
    case 'cloudOnly':
      return {
        path: params.target.path,
        atMs: params.clock(),
        outcome: 'changedSinceScan',
        code: null,
        deleteRan: false,
      };
    // Where its content lies is not known: it may be another volume, or a placeholder.
    case 'unread': {
      const unreadOutcome = fileFailureToOutcome(getFileFailure({ code: placement.code }));

      return {
        path: params.target.path,
        atMs: params.clock(),
        outcome: unreadOutcome.outcome,
        code: unreadOutcome.code,
        deleteRan: false,
      };
    }
    // A link is removed as itself, never followed, as a target on disk is.
    case 'onDisk':
    case 'link':
      break;
  }

  const removed = await params.delete.removeTree({ path: params.target.path });

  if (removed.kind === 'succeeded') {
    return treeRemovalToTargetOutcome({
      path: params.target.path,
      removal: removed.value,
      atMs: params.clock(),
    });
  }

  return {
    path: params.target.path,
    atMs: params.clock(),
    outcome: removalFailureToOutcomeKind(getFileFailure({ code: removed.failure })),
    code: removed.failure,
    deleteRan: true,
  };
}

/** What a removal that ran and failed makes of its target, by the reason of the system's code. */
function removalFailureToOutcomeKind(failure: FileFailure): RemovalOutcomeCodedKind {
  switch (failure.reason) {
    case 'permissionDenied':
      return 'permissionDenied';
    // The removal ran, so part of the target may be gone: only a refusal names its own outcome.
    case 'missing':
    case 'inUse':
    case 'unexpected':
      return 'failed';
  }
}

function treeRemovalToTargetOutcome(params: {
  path: string;
  removal: TreeRemoval;
  atMs: number;
}): TargetOutcome {
  switch (params.removal.kind) {
    case 'removed':
      return {
        path: params.path,
        atMs: params.atMs,
        outcome: 'removed',
        code: null,
        deleteRan: true,
      };
    case 'partlyRemoved':
      return {
        path: params.path,
        atMs: params.atMs,
        outcome: 'partlyRemoved',
        stayedEntryCount: params.removal.stayedEntryCount,
        deleteRan: true,
      };
  }
}

/**
 * The item is gone once each target is: `alreadyGone` when none went by this run, else `removed`,
 * freeing `presentBytes`, what its targets held before the run. Otherwise it takes the outcome of
 * the first target that stayed, and frees the drop from `presentBytes` to what its targets still
 * hold, measured as the scan measured them, once any delete ran.
 */
async function loadTargetsOutcome(params: {
  candidate: Candidate;
  targetOutcomes: [TargetOutcome, ...TargetOutcome[]];
  presentBytes: number;
  entryReads: EntryReads;
}): Promise<TargetsRemovalOutcome> {
  const decision = decideTargetsOutcome({
    targets: params.targetOutcomes,
    getOutcome: (targetOutcome) => targetOutcome.outcome,
  });

  if (decision.kind === 'gone') {
    return {
      candidate: params.candidate,
      freedBytes: decision.outcome === 'removed' ? params.presentBytes : 0,
      outcome: decision.outcome,
      code: null,
    };
  }

  if (!params.targetOutcomes.some((targetOutcome) => targetOutcome.deleteRan)) {
    return buildStayedTargetOutcome({
      candidate: params.candidate,
      stayedTarget: decision.target,
      targetOutcomes: params.targetOutcomes,
      freedBytes: 0,
    });
  }

  const left = await loadPathMeasurement({
    paths: params.targetOutcomes.map((targetOutcome) => targetOutcome.path),
    deadlineMs: Date.now() + SCAN_LIMITS.measureTimeoutMs,
    entryReads: params.entryReads,
    recordEvictedEntry: null,
  });

  return buildStayedTargetOutcome({
    candidate: params.candidate,
    stayedTarget: decision.target,
    targetOutcomes: params.targetOutcomes,
    freedBytes: getMeasuredFreedBytes({ beforeBytes: params.presentBytes, after: left }),
  });
}

/**
 * The item's outcome named by `stayedTarget`, the first of its `targetOutcomes` that stayed, whole
 * or in part; one left in part counts the entries that stayed of every target left in part.
 */
function buildStayedTargetOutcome(params: {
  candidate: Candidate;
  stayedTarget: TargetOutcome;
  targetOutcomes: TargetOutcome[];
  freedBytes: number;
}): TargetsRemovalOutcome {
  switch (params.stayedTarget.outcome) {
    case 'partlyRemoved':
      return {
        candidate: params.candidate,
        freedBytes: params.freedBytes,
        outcome: 'partlyRemoved',
        stayedEntryCount: countStayedEntries({ targetOutcomes: params.targetOutcomes }),
      };
    case 'removed':
    case 'alreadyGone':
    case 'changedSinceScan':
    case 'ownerRunning':
    case 'permissionDenied':
    case 'failed':
    case 'notAttempted':
    case 'engineInUse':
    case 'engineNotRunning':
      return {
        candidate: params.candidate,
        freedBytes: params.freedBytes,
        outcome: params.stayedTarget.outcome,
        code: params.stayedTarget.code,
      };
  }
}

/** The entries that stayed in all the targets their removal left in part. */
function countStayedEntries(params: { targetOutcomes: TargetOutcome[] }): number {
  let stayedEntryCount = 0;

  for (const targetOutcome of params.targetOutcomes) {
    if (targetOutcome.outcome === 'partlyRemoved') {
      stayedEntryCount += targetOutcome.stayedEntryCount;
    }
  }

  return stayedEntryCount;
}

function isSameIdentity(params: { current: FileIdentity; scanned: FileIdentity }): boolean {
  return (
    params.current.dev === params.scanned.dev &&
    params.current.ino === params.scanned.ino &&
    params.current.birthtimeNs === params.scanned.birthtimeNs &&
    params.current.kind === params.scanned.kind &&
    params.current.realPath === params.scanned.realPath
  );
}

function buildNotAttemptedOutcomes(params: { candidates: Candidate[] }): RemovalOutcome[] {
  return params.candidates.map((candidate) => ({
    candidate: candidate,
    freedBytes: 0,
    outcome: 'notAttempted',
    code: null,
  }));
}
