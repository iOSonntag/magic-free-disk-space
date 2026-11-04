import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreProbePlatform } from '../explore/exploreProbe.js';
import type { Result } from '../result.js';
import { SYSTEM_COMMAND_TIMEOUT_MS } from '../system/limits.js';
import type { SystemPlatform } from '../system/systemPlatform.js';
import type { RemovalRun } from './deleteCandidates.js';
import { deleteCandidates } from './deleteCandidates.js';
import type { DeletePlatform } from './deletePlatform.js';
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
  environment: Environment;
  /** The delete slice, whose `removeTree` removes each path. */
  delete: DeletePlatform;
  /** The system slice's process listing. */
  loadRunningProcesses: SystemPlatform['loadRunningProcesses'];
  /** The system slice's eviction check, for the measurements around a tool's run. */
  isEntryEvicted: SystemPlatform['isEntryEvicted'];
  /** What the rechecks of the units read by. */
  probePlatform: ExploreProbePlatform;
  clock: () => number;
}): Promise<Result<ApprovedRemoval, JournalFailure>> {
  const journal = await createDeletionJournal({
    logPath: params.environment.deletionLogPath,
    nowMs: params.clock(),
  });

  if (journal.kind === 'failed') {
    return journal;
  }

  const run = await deleteCandidates({
    candidates: params.plan.approved,
    journal: journal.value,
    environment: params.environment,
    delete: params.delete,
    probePlatform: params.probePlatform,
    isEntryEvicted: params.isEntryEvicted,
    loadProcessCommands: () =>
      loadCurrentProcessCommands({ loadRunningProcesses: params.loadRunningProcesses }),
    clock: params.clock,
  });

  return { kind: 'succeeded', value: { run: run, logPath: journal.value.logPath } };
}

/** `null` when the process listing failed, which withholds every item whose owner it would name. */
async function loadCurrentProcessCommands(params: {
  loadRunningProcesses: SystemPlatform['loadRunningProcesses'];
}): Promise<string[] | null> {
  const processCommands = await params.loadRunningProcesses({
    commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
  });

  return processCommands.kind === 'succeeded' ? processCommands.value : null;
}
