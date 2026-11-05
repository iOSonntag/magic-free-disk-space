import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreProbePlatform } from '../explore/exploreProbe.js';
import type { ExploreProbeFailure } from '../explore/exploreUnit.js';
import { buildUnitRunArguments } from '../explore/exploreUnit.js';
import { recheckExplorePathUnit } from '../explore/recheckExploreUnit.js';
import type {
  Candidate,
  CandidateRemovalDeletePath,
  CandidateRemovalDeleteUnitFolder,
} from '../scan/candidate.js';
import { SCAN_LIMITS } from '../scan/limits.js';
import { getMeasuredFreedBytes, loadPathMeasurement } from '../scan/loadPathMeasurement.js';
import type { EntryReads } from '../system/entryReads.js';
import { isAnyBundleRunning } from '../system/isAnyBundleRunning.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import type { ReadFailure } from '../system/readFailure.js';
import type { DeletePlatform } from './deletePlatform.js';
import type { DeletionJournal, JournalEntry, JournalFailure } from './deletionJournal.js';
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
  | 'toolFailed';

/** The outcomes that carry an error code rather than a tool failure. */
export type RemovalOutcomeCodedKind = Exclude<RemovalOutcomeKind, 'toolFailed'>;

export type RemovalOutcomeCoded = {
  candidate: Candidate;
  path: string;
  allocatedBytes: number;
  /**
   * The space the removal gave back: a deleted path's size, the measured drop of a path whose
   * removal failed partway, or a tool run's measured drop.
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
      return false;
  }
}

/**
 * Removes each candidate permanently, in order, after recording the intent. A path goes only
 * while its identity still matches the scan and no owner app runs in the processes
 * `loadProcessCommands` read once after the confirmation; `null` withholds every owned item. A
 * tool item, and a unit deleted as its folder, read the processes afresh and go only while the
 * unit is still unchanged and idle. A journal failure stops the run.
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

    const outcomeRecorded = await params.journal.append({ entry: removal.outcomeEntry });

    if (outcomeRecorded.kind === 'failed') {
      return {
        outcomes: [
          ...outcomes,
          ...buildNotAttemptedOutcomes({ candidates: params.candidates.slice(index + 1) }),
        ],
        journalFailure: outcomeRecorded.failure,
      };
    }
  }

  return { outcomes: outcomes, journalFailure: null };
}

function buildIntentEntry(params: { candidate: Candidate; atMs: number }): JournalEntry {
  switch (params.candidate.removal.kind) {
    case 'deletePath':
    case 'deleteUnitFolder':
      return {
        kind: 'intent',
        atMs: params.atMs,
        path: params.candidate.path,
        allocatedBytes: params.candidate.allocatedBytes,
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
    case 'deletePath': {
      const outcome = await deletePathCandidate({
        candidate: params.candidate,
        removal: params.candidate.removal,
        delete: params.delete,
        entryReads: params.entryReads,
        processCommands: params.processCommands,
      });

      return pathOutcomeToRemoval({ outcome: outcome, atMs: params.clock() });
    }
    case 'deleteUnitFolder': {
      const outcome = await deleteUnitFolderCandidate({
        candidate: params.candidate,
        removal: params.candidate.removal,
        environment: params.environment,
        delete: params.delete,
        probePlatform: params.probePlatform,
        entryReads: params.entryReads,
        loadProcessCommands: params.loadProcessCommands,
      });

      return pathOutcomeToRemoval({ outcome: outcome, atMs: params.clock() });
    }
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

/** The outcome of a removal and the journal entry that records it. */
export type RecordedRemoval = { outcome: RemovalOutcome; outcomeEntry: JournalEntry };

function pathOutcomeToRemoval(params: {
  outcome: RemovalOutcomeCoded;
  atMs: number;
}): RecordedRemoval {
  return {
    outcome: params.outcome,
    outcomeEntry: {
      kind: 'outcome',
      atMs: params.atMs,
      path: params.outcome.path,
      outcome: params.outcome.outcome,
      code: params.outcome.code,
    },
  };
}

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
        outcomeEntry: {
          kind: 'toolOutcome',
          atMs: params.atMs,
          path: params.candidate.path,
          outcome: 'removed',
          exitCode: 0,
          stderrTail: params.run.stderrTail,
          freedBytes: params.run.freedBytes,
        },
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
        outcomeEntry: {
          kind: 'toolOutcome',
          atMs: params.atMs,
          path: params.candidate.path,
          outcome: params.run.reason,
        },
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
        outcomeEntry: {
          kind: 'toolOutcome',
          atMs: params.atMs,
          path: params.candidate.path,
          outcome: 'toolFailed',
          freedBytes: params.run.freedBytes,
          failure: params.run.failure,
        },
      };
  }
}

async function deletePathCandidate(params: {
  candidate: Candidate;
  removal: CandidateRemovalDeletePath;
  delete: DeletePlatform;
  entryReads: EntryReads;
  processCommands: string[] | null;
}): Promise<RemovalOutcomeCoded> {
  if (
    isOwnerPossiblyRunning({
      ownerBundlePaths: params.removal.ownerBundlePaths,
      processCommands: params.processCommands,
    })
  ) {
    return buildPathOutcome({
      candidate: params.candidate,
      path: params.candidate.path,
      outcome: 'ownerRunning',
      code: null,
    });
  }

  return deleteScannedPath({
    candidate: params.candidate,
    path: params.candidate.path,
    identity: params.removal.identity,
    delete: params.delete,
    entryReads: params.entryReads,
  });
}

/**
 * Deletes the unit's folder only while a fresh recheck, with the processes read right before,
 * still offers the unit for the same reason, and the folder's identity still matches the scan.
 */
async function deleteUnitFolderCandidate(params: {
  candidate: Candidate;
  removal: CandidateRemovalDeleteUnitFolder;
  environment: Environment;
  delete: DeletePlatform;
  probePlatform: ExploreProbePlatform;
  entryReads: EntryReads;
  loadProcessCommands: () => Promise<string[] | null>;
}): Promise<RemovalOutcomeCoded> {
  const folderPath = params.removal.unit.folderPath;
  const recheck = await recheckExplorePathUnit({
    unit: params.removal.unit,
    environment: params.environment,
    platform: params.probePlatform,
    processCommands: await params.loadProcessCommands(),
  });

  switch (recheck.kind) {
    case 'changed':
      return buildPathOutcome({
        candidate: params.candidate,
        path: folderPath,
        outcome: 'changedSinceScan',
        code: null,
      });
    case 'busy':
      return buildPathOutcome({
        candidate: params.candidate,
        path: folderPath,
        outcome: 'ownerRunning',
        code: null,
      });
    case 'failed':
      return buildPathOutcome({
        candidate: params.candidate,
        path: folderPath,
        outcome: readFailureToOutcomeKind(recheck.failure.failure),
        code: recheck.failure.failure.code,
      });
    case 'unchanged':
      return deleteScannedPath({
        candidate: params.candidate,
        path: folderPath,
        identity: params.removal.identity,
        delete: params.delete,
        entryReads: params.entryReads,
      });
  }
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

/** Deletes the path only while its identity still matches the scan. */
async function deleteScannedPath(params: {
  candidate: Candidate;
  path: string;
  identity: FileIdentity;
  delete: DeletePlatform;
  entryReads: EntryReads;
}): Promise<RemovalOutcomeCoded> {
  const currentIdentity = await loadFileIdentity({ path: params.path });

  if (currentIdentity.kind === 'failed') {
    if (currentIdentity.failure.reason === 'missing') {
      return buildPathOutcome({
        candidate: params.candidate,
        path: params.path,
        outcome: 'alreadyGone',
        code: null,
      });
    }

    if (currentIdentity.failure.reason === 'permissionDenied') {
      return buildPathOutcome({
        candidate: params.candidate,
        path: params.path,
        outcome: 'permissionDenied',
        code: currentIdentity.failure.code,
      });
    }

    return buildPathOutcome({
      candidate: params.candidate,
      path: params.path,
      outcome: 'failed',
      code: currentIdentity.failure.code,
    });
  }

  if (!isSameIdentity({ current: currentIdentity.value, scanned: params.identity })) {
    return buildPathOutcome({
      candidate: params.candidate,
      path: params.path,
      outcome: 'changedSinceScan',
      code: null,
    });
  }

  const removed = await params.delete.removeTree({ path: params.path });

  if (removed.kind === 'succeeded') {
    return buildPathOutcome({
      candidate: params.candidate,
      path: params.path,
      outcome: 'removed',
      code: null,
    });
  }

  return loadFailedRemovalOutcome({
    candidate: params.candidate,
    path: params.path,
    code: removed.failure,
    entryReads: params.entryReads,
  });
}

/**
 * A removal that failed partway frees what it took: the scanned size less what the path holds
 * now, measured as the scan measured it.
 */
async function loadFailedRemovalOutcome(params: {
  candidate: Candidate;
  path: string;
  code: string;
  entryReads: EntryReads;
}): Promise<RemovalOutcomeCoded> {
  const left = await loadPathMeasurement({
    paths: [params.path],
    deadlineMs: Date.now() + SCAN_LIMITS.measureTimeoutMs,
    entryReads: params.entryReads,
  });

  return {
    candidate: params.candidate,
    path: params.path,
    allocatedBytes: params.candidate.allocatedBytes,
    freedBytes: getMeasuredFreedBytes({
      beforeBytes: params.candidate.allocatedBytes,
      after: left,
    }),
    outcome: PERMISSION_DENIED_CODES.includes(params.code) ? 'permissionDenied' : 'failed',
    code: params.code,
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
