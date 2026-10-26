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
 * be created, and reads the running processes again first, since the scan may be minutes old.
 */
export async function deleteApprovedCandidates(params: {
  plan: RemovalPlan;
  deletionLogPath: string;
  clock: () => number;
}): Promise<Result<ApprovedRemoval, JournalFailure>> {
  const journal = await createDeletionJournal({
    logPath: params.deletionLogPath,
    nowMs: params.clock(),
  });

  if (journal.kind === 'failed') {
    return journal;
  }

  const processCommands = await loadProcessCommands({
    commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
  });
  const run = await deleteCandidates({
    candidates: params.plan.approved,
    journal: journal.value,
    processCommands: processCommands.kind === 'succeeded' ? processCommands.value : null,
    clock: params.clock,
  });

  return { kind: 'succeeded', value: { run: run, logPath: journal.value.logPath } };
}
