import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreProbePlatform } from '../explore/exploreProbe.js';
import type { ExploreProbeFailure } from '../explore/exploreUnit.js';
import { buildUnitRunArguments, listEngineUnitIds } from '../explore/exploreUnit.js';
import { recheckExplorePathUnit } from '../explore/recheckExploreUnit.js';
import type {
  Candidate,
  CandidateRemovalDeletePaths,
  CandidateRemovalDeleteUnitPaths,
  RemovalTarget,
  RemovalTargets,
} from '../scan/candidate.js';
import { SCAN_LIMITS } from '../scan/limits.js';
import { getMeasuredFreedBytes, loadPathMeasurement } from '../scan/loadPathMeasurement.js';
import type { EntryReads } from '../system/entryReads.js';
import { isAnyBundleRunning } from '../system/isAnyBundleRunning.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import type { ReadFailure } from '../system/readFailure.js';
import { callEngineCandidate } from './callEngineCandidate.js';
import type { DeletePlatform } from './deletePlatform.js';
import type { DeletionJournal, JournalEntry, JournalFailure } from './deletionJournal.js';
import { evictCandidateFiles } from './evictCandidateFiles.js';
import type { ToolCandidateRun } from './runToolCandidate.js';
import { runToolCandidate, TOOL_RUN_TIMEOUT_MS } from './runToolCandidate.js';

export type RemovalOutcomeKind =
  | 'removed'
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

/** The outcomes that carry an error code rather than a tool failure. */
export type RemovalOutcomeCodedKind = Exclude<RemovalOutcomeKind, 'toolFailed'>;

export type RemovalOutcomeCoded = {
  candidate: Candidate;
  path: string;
  allocatedBytes: number;
  /**
   * The space the removal gave back: a deleted item's size, the measured drop of an item whose
   * targets went only in part, a tool run's measured drop, or what an engine reports it freed.
   */
  freedBytes: number;
  outcome: RemovalOutcomeCodedKind;
  /** The error code of the failed file call, else `null`. */
  code: string | null;
};

/** A tool that failed may still have removed part of its unit, which `freedBytes` holds. */
export type RemovalOutcomeToolFailed = {
  candidate: Candidate;
  path: string;
  allocatedBytes: number;
  freedBytes: number;
  outcome: 'toolFailed';
  failure: ExploreProbeFailure;
};

export type RemovalOutcome = RemovalOutcomeCoded | RemovalOutcomeToolFailed;

export type RemovalRun = {
  outcomes: RemovalOutcome[];
  journalFailure: JournalFailure | null;
};

const PERMISSION_DENIED_CODES = ['EACCES', 'EPERM'];

/** Whether the outcome left its item in place through a failure, which the run reports. */
export function isUnremovedOutcome(kind: RemovalOutcomeKind): boolean {
  switch (kind) {
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
 * outcome entries after it. A target goes only while its identity still matches the scan and no
 * owner app runs in the processes `loadProcessCommands` read once after the confirmation; `null`
 * withholds every owned item. A tool item, a unit deleted as its paths, an evict, and an engine's
 * unit are checked again first and go only while the unit is still unchanged and idle. A journal
 * failure stops the run.
 */
export async function deleteCandidates(params: {
  candidates: Candidate[];
  journal: DeletionJournal;
  environment: Environment;
  /** The delete slice, whose `removeTree` removes each path. */
  delete: DeletePlatform;
  /** What the rechecks of the units read by. */
  probePlatform: ExploreProbePlatform;
  /** The system slice's entry reads, for measuring around a tool's run and a failed removal. */
  entryReads: EntryReads;
  loadProcessCommands: () => Promise<string[] | null>;
  clock: () => number;
}): Promise<RemovalRun> {
  const processCommands = await params.loadProcessCommands();
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
      processCommands: processCommands,
      loadProcessCommands: params.loadProcessCommands,
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
  processCommands: string[] | null;
  loadProcessCommands: () => Promise<string[] | null>;
  clock: () => number;
}): Promise<RecordedRemoval> {
  switch (params.candidate.removal.kind) {
    case 'deletePaths':
      return deletePathsCandidate({
        candidate: params.candidate,
        removal: params.candidate.removal,
        delete: params.delete,
        entryReads: params.entryReads,
        processCommands: params.processCommands,
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
        loadProcessCommands: params.loadProcessCommands,
        clock: params.clock,
      });
    case 'evictUnitFiles':
      return evictCandidateFiles({
        candidate: params.candidate,
        removal: params.candidate.removal,
        environment: params.environment,
        clock: params.clock,
      });
    case 'callEngine':
      return callEngineCandidate({
        candidate: params.candidate,
        removal: params.candidate.removal,
        user: params.environment.user,
        clock: params.clock,
      });
    case 'runTool': {
      const run = await runToolCandidate({
        unit: params.candidate.removal.unit,
        environment: params.environment,
        probePlatform: params.probePlatform,
        entryReads: params.entryReads,
        loadProcessCommands: params.loadProcessCommands,
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
 * per target of an item of paths or an evict, one for a tool's run or an engine's call.
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
          path: params.candidate.path,
          allocatedBytes: params.candidate.allocatedBytes,
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
          path: params.candidate.path,
          allocatedBytes: params.candidate.allocatedBytes,
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
          path: params.candidate.path,
          allocatedBytes: params.candidate.allocatedBytes,
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
  delete: DeletePlatform;
  entryReads: EntryReads;
  processCommands: string[] | null;
  clock: () => number;
}): Promise<RecordedRemoval> {
  if (
    isOwnerPossiblyRunning({
      ownerBundlePaths: params.removal.ownerBundlePaths,
      processCommands: params.processCommands,
    })
  ) {
    return buildKeptRemoval({
      candidate: params.candidate,
      targets: params.removal.targets,
      outcome: 'ownerRunning',
      code: null,
      atMs: params.clock(),
    });
  }

  return deleteScannedTargets({
    candidate: params.candidate,
    targets: params.removal.targets,
    delete: params.delete,
    entryReads: params.entryReads,
    clock: params.clock,
  });
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
  loadProcessCommands: () => Promise<string[] | null>;
  clock: () => number;
}): Promise<RecordedRemoval> {
  const recheck = await recheckExplorePathUnit({
    unit: params.removal.unit,
    environment: params.environment,
    platform: params.probePlatform,
    processCommands: await params.loadProcessCommands(),
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
  const [firstTarget, ...otherTargets] = params.targets;
  const buildEntry = (target: RemovalTarget): JournalEntry => ({
    kind: 'outcome',
    atMs: params.atMs,
    path: target.path,
    outcome: params.outcome,
    code: params.code,
  });

  return {
    outcome: buildPathOutcome({
      candidate: params.candidate,
      path: params.candidate.path,
      outcome: params.outcome,
      code: params.code,
    }),
    outcomeEntries: [buildEntry(firstTarget), ...otherTargets.map(buildEntry)],
  };
}

function readFailureToOutcomeKind(failure: ReadFailure): RemovalOutcomeCodedKind {
  switch (failure.reason) {
    // The outcome shows the code, which already tells a privacy denial from a POSIX one.
    case 'privacyDenied':
    case 'permissionDenied':
      return 'permissionDenied';
    case 'unexpected':
      return 'failed';
  }
}

/** What became of one target, and whether its delete ran, which may have taken part of it. */
type TargetOutcome = {
  path: string;
  atMs: number;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
  deleteRan: boolean;
};

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
  const [firstTarget, ...otherTargets] = params.targets;
  const targetOutcomes: [TargetOutcome, ...TargetOutcome[]] = [
    await deleteScannedTarget({ target: firstTarget, delete: params.delete, clock: params.clock }),
  ];

  for (const target of otherTargets) {
    targetOutcomes.push(
      await deleteScannedTarget({ target: target, delete: params.delete, clock: params.clock }),
    );
  }

  const [firstOutcome, ...otherOutcomes] = targetOutcomes;
  const buildEntry = (targetOutcome: TargetOutcome): JournalEntry => ({
    kind: 'outcome',
    atMs: targetOutcome.atMs,
    path: targetOutcome.path,
    outcome: targetOutcome.outcome,
    code: targetOutcome.code,
  });

  return {
    outcome: await loadTargetsOutcome({
      candidate: params.candidate,
      targetOutcomes: targetOutcomes,
      entryReads: params.entryReads,
    }),
    outcomeEntries: [buildEntry(firstOutcome), ...otherOutcomes.map(buildEntry)],
  };
}

/** Deletes the target only while its identity still matches the scan. */
async function deleteScannedTarget(params: {
  target: RemovalTarget;
  delete: DeletePlatform;
  clock: () => number;
}): Promise<TargetOutcome> {
  const path = params.target.path;
  const currentIdentity = await loadFileIdentity({ path: path });

  if (currentIdentity.kind === 'failed') {
    if (currentIdentity.failure.reason === 'missing') {
      return {
        path: path,
        atMs: params.clock(),
        outcome: 'alreadyGone',
        code: null,
        deleteRan: false,
      };
    }

    return {
      path: path,
      atMs: params.clock(),
      outcome:
        currentIdentity.failure.reason === 'permissionDenied' ? 'permissionDenied' : 'failed',
      code: currentIdentity.failure.code,
      deleteRan: false,
    };
  }

  if (!isSameIdentity({ current: currentIdentity.value, scanned: params.target.identity })) {
    return {
      path: path,
      atMs: params.clock(),
      outcome: 'changedSinceScan',
      code: null,
      deleteRan: false,
    };
  }

  const removed = await params.delete.removeTree({ path: path });

  if (removed.kind === 'succeeded') {
    return { path: path, atMs: params.clock(), outcome: 'removed', code: null, deleteRan: true };
  }

  return {
    path: path,
    atMs: params.clock(),
    outcome: PERMISSION_DENIED_CODES.includes(removed.failure) ? 'permissionDenied' : 'failed',
    code: removed.failure,
    deleteRan: true,
  };
}

/**
 * The item is gone once each target is: `alreadyGone` when none went by this run, else `removed`
 * with its scanned size. Otherwise it takes the first target that stayed, and frees what its
 * targets no longer hold, measured as the scan measured them, once any delete ran.
 */
async function loadTargetsOutcome(params: {
  candidate: Candidate;
  targetOutcomes: [TargetOutcome, ...TargetOutcome[]];
  entryReads: EntryReads;
}): Promise<RemovalOutcomeCoded> {
  const isGone = (targetOutcome: TargetOutcome): boolean =>
    targetOutcome.outcome === 'removed' || targetOutcome.outcome === 'alreadyGone';
  const stayedOutcome = params.targetOutcomes.find((targetOutcome) => !isGone(targetOutcome));

  if (stayedOutcome === undefined) {
    const hasRemoved = params.targetOutcomes.some(
      (targetOutcome) => targetOutcome.outcome === 'removed',
    );

    return buildPathOutcome({
      candidate: params.candidate,
      path: params.candidate.path,
      outcome: hasRemoved ? 'removed' : 'alreadyGone',
      code: null,
    });
  }

  if (!params.targetOutcomes.some((targetOutcome) => targetOutcome.deleteRan)) {
    return buildPathOutcome({
      candidate: params.candidate,
      path: params.candidate.path,
      outcome: stayedOutcome.outcome,
      code: stayedOutcome.code,
    });
  }

  const left = await loadPathMeasurement({
    paths: params.targetOutcomes.map((targetOutcome) => targetOutcome.path),
    deadlineMs: Date.now() + SCAN_LIMITS.measureTimeoutMs,
    entryReads: params.entryReads,
  });

  return {
    candidate: params.candidate,
    path: params.candidate.path,
    allocatedBytes: params.candidate.allocatedBytes,
    freedBytes: getMeasuredFreedBytes({
      beforeBytes: params.candidate.allocatedBytes,
      after: left,
    }),
    outcome: stayedOutcome.outcome,
    code: stayedOutcome.code,
  };
}

/** A deleted path frees its scanned size; any other outcome built here frees nothing. */
function buildPathOutcome(params: {
  candidate: Candidate;
  path: string;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
}): RemovalOutcomeCoded {
  return {
    candidate: params.candidate,
    path: params.path,
    allocatedBytes: params.candidate.allocatedBytes,
    freedBytes: params.outcome === 'removed' ? params.candidate.allocatedBytes : 0,
    outcome: params.outcome,
    code: params.code,
  };
}

/** An owned item is withheld while its app runs, or while that cannot be checked. */
function isOwnerPossiblyRunning(params: {
  ownerBundlePaths: string[];
  processCommands: string[] | null;
}): boolean {
  if (params.ownerBundlePaths.length === 0) {
    return false;
  }

  if (params.processCommands === null) {
    return true;
  }

  return isAnyBundleRunning({
    bundlePaths: params.ownerBundlePaths,
    processCommands: params.processCommands,
  });
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
  return params.candidates.map((candidate) =>
    buildPathOutcome({
      candidate: candidate,
      path: candidate.path,
      outcome: 'notAttempted',
      code: null,
    }),
  );
}
