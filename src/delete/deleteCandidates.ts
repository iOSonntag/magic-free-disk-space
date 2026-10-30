import { rm } from 'node:fs/promises';
import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreProbeFailure } from '../explore/exploreUnit.js';
import { buildUnitRunArguments } from '../explore/exploreUnit.js';
import type { Result } from '../result.js';
import type { Candidate, CandidateRemovalDeletePath } from '../scan/candidate.js';
import { getErrorCode } from '../system/getErrorCode.js';
import { isAnyBundleRunning } from '../system/isAnyBundleRunning.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
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
  path: string;
  allocatedBytes: number;
  /** The space the removal gave back: a deleted path's size, or a tool run's measured drop. */
  freedBytes: number;
  outcome: RemovalOutcomeCodedKind;
  /** The error code of the failed file call, else `null`. */
  code: string | null;
};

/** A tool that failed may still have removed part of its unit, which `freedBytes` holds. */
export type RemovalOutcomeToolFailed = {
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
 * tool item reads the processes afresh and runs only while its unit is still unchanged and
 * idle. A journal failure stops the run.
 */
export async function deleteCandidates(params: {
  candidates: Candidate[];
  journal: DeletionJournal;
  environment: Environment;
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
  /** The processes read once before the run, for path items. */
  processCommands: string[] | null;
  loadProcessCommands: () => Promise<string[] | null>;
  clock: () => number;
}): Promise<RecordedRemoval> {
  switch (params.candidate.removal.kind) {
    case 'deletePath': {
      const outcome = await deletePathCandidate({
        path: params.candidate.path,
        allocatedBytes: params.candidate.allocatedBytes,
        removal: params.candidate.removal,
        processCommands: params.processCommands,
      });

      return {
        outcome: outcome,
        outcomeEntry: {
          kind: 'outcome',
          atMs: params.clock(),
          path: outcome.path,
          outcome: outcome.outcome,
          code: outcome.code,
        },
      };
    }
    case 'runTool': {
      const run = await runToolCandidate({
        unit: params.candidate.removal.unit,
        environment: params.environment,
        loadProcessCommands: params.loadProcessCommands,
        timeoutMs: TOOL_RUN_TIMEOUT_MS,
      });

      return toolCandidateRunToRemoval({
        path: params.candidate.path,
        allocatedBytes: params.candidate.allocatedBytes,
        run: run,
        atMs: params.clock(),
      });
    }
    case 'deleteUnitFolder':
      throw new Error('The deletion of a unit folder is not built yet (part 2B3)');
  }
}

/** The outcome of a removal and the journal entry that records it. */
export type RecordedRemoval = { outcome: RemovalOutcome; outcomeEntry: JournalEntry };

/** Maps the run of a tool item onto its outcome and its `toolOutcome` journal entry. */
export function toolCandidateRunToRemoval(params: {
  path: string;
  allocatedBytes: number;
  run: ToolCandidateRun;
  atMs: number;
}): RecordedRemoval {
  switch (params.run.kind) {
    case 'completed':
      return {
        outcome: {
          path: params.path,
          allocatedBytes: params.allocatedBytes,
          freedBytes: params.run.freedBytes,
          outcome: 'removed',
          code: null,
        },
        outcomeEntry: {
          kind: 'toolOutcome',
          atMs: params.atMs,
          path: params.path,
          outcome: 'removed',
          exitCode: 0,
          stderrTail: params.run.stderrTail,
          freedBytes: params.run.freedBytes,
        },
      };
    case 'skipped':
      return {
        outcome: {
          path: params.path,
          allocatedBytes: params.allocatedBytes,
          freedBytes: 0,
          outcome: params.run.reason,
          code: null,
        },
        outcomeEntry: {
          kind: 'toolOutcome',
          atMs: params.atMs,
          path: params.path,
          outcome: params.run.reason,
        },
      };
    case 'failed':
      return {
        outcome: {
          path: params.path,
          allocatedBytes: params.allocatedBytes,
          freedBytes: params.run.freedBytes,
          outcome: 'toolFailed',
          failure: params.run.failure,
        },
        outcomeEntry: {
          kind: 'toolOutcome',
          atMs: params.atMs,
          path: params.path,
          outcome: 'toolFailed',
          freedBytes: params.run.freedBytes,
          failure: params.run.failure,
        },
      };
  }
}

async function deletePathCandidate(params: {
  path: string;
  allocatedBytes: number;
  removal: CandidateRemovalDeletePath;
  processCommands: string[] | null;
}): Promise<RemovalOutcomeCoded> {
  if (
    isOwnerPossiblyRunning({
      ownerBundlePaths: params.removal.ownerBundlePaths,
      processCommands: params.processCommands,
    })
  ) {
    return buildPathOutcome({
      path: params.path,
      allocatedBytes: params.allocatedBytes,
      outcome: 'ownerRunning',
      code: null,
    });
  }

  const currentIdentity = await loadFileIdentity({ path: params.path });

  if (currentIdentity.kind === 'failed') {
    if (currentIdentity.failure.reason === 'missing') {
      return buildPathOutcome({
        path: params.path,
        allocatedBytes: params.allocatedBytes,
        outcome: 'alreadyGone',
        code: null,
      });
    }

    if (currentIdentity.failure.reason === 'permissionDenied') {
      return buildPathOutcome({
        path: params.path,
        allocatedBytes: params.allocatedBytes,
        outcome: 'permissionDenied',
        code: currentIdentity.failure.code,
      });
    }

    return buildPathOutcome({
      path: params.path,
      allocatedBytes: params.allocatedBytes,
      outcome: 'failed',
      code: currentIdentity.failure.code,
    });
  }

  if (!isSameIdentity({ current: currentIdentity.value, scanned: params.removal.identity })) {
    return buildPathOutcome({
      path: params.path,
      allocatedBytes: params.allocatedBytes,
      outcome: 'changedSinceScan',
      code: null,
    });
  }

  const removed = await removePath({ path: params.path });

  if (removed.kind === 'succeeded') {
    return buildPathOutcome({
      path: params.path,
      allocatedBytes: params.allocatedBytes,
      outcome: 'removed',
      code: null,
    });
  }

  if (PERMISSION_DENIED_CODES.includes(removed.failure)) {
    return buildPathOutcome({
      path: params.path,
      allocatedBytes: params.allocatedBytes,
      outcome: 'permissionDenied',
      code: removed.failure,
    });
  }

  return buildPathOutcome({
    path: params.path,
    allocatedBytes: params.allocatedBytes,
    outcome: 'failed',
    code: removed.failure,
  });
}

/** A deleted path frees its scanned size; any other outcome frees nothing. */
function buildPathOutcome(params: {
  path: string;
  allocatedBytes: number;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
}): RemovalOutcomeCoded {
  return {
    path: params.path,
    allocatedBytes: params.allocatedBytes,
    freedBytes: params.outcome === 'removed' ? params.allocatedBytes : 0,
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

/** Removes the path recursively; a symbolic link inside is removed itself, never its target. */
async function removePath(params: { path: string }): Promise<Result<null, string>> {
  try {
    await rm(params.path, { recursive: true });

    return { kind: 'succeeded', value: null };
  } catch (error) {
    return { kind: 'failed', failure: getErrorCode(error) };
  }
}

function buildNotAttemptedOutcomes(params: { candidates: Candidate[] }): RemovalOutcome[] {
  return params.candidates.map((candidate) =>
    buildPathOutcome({
      path: candidate.path,
      allocatedBytes: candidate.allocatedBytes,
      outcome: 'notAttempted',
      code: null,
    }),
  );
}
