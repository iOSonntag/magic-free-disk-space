import type { Environment } from '../environment/buildEnvironment.js';
import type { Result } from '../result.js';
import { SCAN_LIMITS } from '../scan/limits.js';
import { loadProcessCommands } from '../scan/loadProcessCommands.js';
import type { RemovalRun } from './deleteCandidates.js';
import { deleteCandidates } from './deleteCandidates.js';
import type { JournalFailure } from './deletionJournal.js';
import { createDeletionJournal } from './deletionJournal.js';
import type { RemovalPlan } from './planRemoval.js';

type ApprovedRemoval = {
  run: RemovalRun;
  logPath: string;
};

/**
 * Deletes the approved items of a confirmed plan. Fails before any deletion when the log cannot
 * be created. The running processes are read again, since the scan may be minutes old: once
 * before the run, and afresh for each tool item, since the items before it may take minutes.
 */
export async function deleteApprovedCandidates(params: {
  plan: RemovalPlan;
  deletionLogPath: string;
  environment: Environment;
  clock: () => number;
}): Promise<Result<ApprovedRemoval, JournalFailure>> {
  const journal = await createDeletionJournal({
    logPath: params.deletionLogPath,
    nowMs: params.clock(),
  });

  if (journal.kind === 'failed') {
    return journal;
  }

  const run = await deleteCandidates({
    candidates: params.plan.approved,
    journal: journal.value,
    environment: params.environment,
    loadProcessCommands: loadCurrentProcessCommands,
    clock: params.clock,
  });

  return { kind: 'succeeded', value: { run: run, logPath: journal.value.logPath } };
}

/** `null` when `ps` failed, which withholds every item whose owner it would name. */
async function loadCurrentProcessCommands(): Promise<string[] | null> {
  const processCommands = await loadProcessCommands({
    commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
  });

  return processCommands.kind === 'succeeded' ? processCommands.value : null;
}
