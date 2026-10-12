import { rm } from 'node:fs/promises';
import type { Result } from '../result.js';
import type { Candidate } from '../scan/candidate.js';
import { getErrorCode } from '../system/getErrorCode.js';
import { isAnyBundleRunning } from '../system/isAnyBundleRunning.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import type { DeletionJournal, JournalFailure } from './deletionJournal.js';

export type RemovalOutcomeKind =
  | 'removed'
  | 'alreadyGone'
  | 'changedSinceScan'
  | 'ownerRunning'
  | 'permissionDenied'
  | 'failed'
  | 'notAttempted';

export type RemovalOutcome = {
  path: string;
  allocatedBytes: number;
  outcome: RemovalOutcomeKind;
  code: string | null;
};

export type RemovalRun = {
  outcomes: RemovalOutcome[];
  journalFailure: JournalFailure | null;
};

const PERMISSION_DENIED_CODES = ['EACCES', 'EPERM'];

/**
 * Deletes each candidate permanently, in order, after recording the intent and only while its
 * identity still matches the scan and no owner app runs in `processCommands`, read after the
 * confirmation; `null` withholds every owned item. A journal failure stops the run.
 */
export async function deleteCandidates(params: {
  candidates: Candidate[];
  journal: DeletionJournal;
  processCommands: string[] | null;
  clock: () => number;
}): Promise<RemovalRun> {
  const outcomes: RemovalOutcome[] = [];

  for (const [index, candidate] of params.candidates.entries()) {
    const intentRecorded = await params.journal.append({
      entry: {
        kind: 'intent',
        atMs: params.clock(),
        path: candidate.path,
        allocatedBytes: candidate.allocatedBytes,
      },
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

    const outcome = await deleteCandidate({
      candidate: candidate,
      processCommands: params.processCommands,
    });

    outcomes.push(outcome);

    const outcomeRecorded = await params.journal.append({
      entry: {
        kind: 'outcome',
        atMs: params.clock(),
        path: candidate.path,
        outcome: outcome.outcome,
        code: outcome.code,
      },
    });

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

async function deleteCandidate(params: {
  candidate: Candidate;
  processCommands: string[] | null;
}): Promise<RemovalOutcome> {
  const path = params.candidate.path;
  const allocatedBytes = params.candidate.allocatedBytes;

  if (
    isOwnerPossiblyRunning({ candidate: params.candidate, processCommands: params.processCommands })
  ) {
    return { path: path, allocatedBytes: allocatedBytes, outcome: 'ownerRunning', code: null };
  }

  const currentIdentity = await loadFileIdentity({ path: path });

  if (currentIdentity.kind === 'failed') {
    if (currentIdentity.failure.reason === 'missing') {
      return { path: path, allocatedBytes: allocatedBytes, outcome: 'alreadyGone', code: null };
    }

    if (currentIdentity.failure.reason === 'permissionDenied') {
      return {
        path: path,
        allocatedBytes: allocatedBytes,
        outcome: 'permissionDenied',
        code: currentIdentity.failure.code,
      };
    }

    return {
      path: path,
      allocatedBytes: allocatedBytes,
      outcome: 'failed',
      code: currentIdentity.failure.code,
    };
  }

  if (!isSameIdentity({ current: currentIdentity.value, scanned: params.candidate.identity })) {
    return { path: path, allocatedBytes: allocatedBytes, outcome: 'changedSinceScan', code: null };
  }

  const removed = await removePath({ path: path });

  if (removed.kind === 'succeeded') {
    return { path: path, allocatedBytes: allocatedBytes, outcome: 'removed', code: null };
  }

  if (PERMISSION_DENIED_CODES.includes(removed.failure)) {
    return {
      path: path,
      allocatedBytes: allocatedBytes,
      outcome: 'permissionDenied',
      code: removed.failure,
    };
  }

  return { path: path, allocatedBytes: allocatedBytes, outcome: 'failed', code: removed.failure };
}

/** An owned item is withheld while its app runs, or while that cannot be checked. */
function isOwnerPossiblyRunning(params: {
  candidate: Candidate;
  processCommands: string[] | null;
}): boolean {
  if (params.candidate.ownerBundlePaths.length === 0) {
    return false;
  }

  if (params.processCommands === null) {
    return true;
  }

  return isAnyBundleRunning({
    bundlePaths: params.candidate.ownerBundlePaths,
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
  return params.candidates.map((candidate) => ({
    path: candidate.path,
    allocatedBytes: candidate.allocatedBytes,
    outcome: 'notAttempted',
    code: null,
  }));
}
