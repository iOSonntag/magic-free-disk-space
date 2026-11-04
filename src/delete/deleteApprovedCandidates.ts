import type { Environment } from '../environment/buildEnvironment.js';
import type { ExplorePlatform } from '../explore/explorePlatform.js';
import type { Result } from '../result.js';
import type { ScanPlatform } from '../scan/scanPlatform.js';
import { SYSTEM_COMMAND_TIMEOUT_MS } from '../system/limits.js';
import type { SystemPlatform } from '../system/systemPlatform.js';
import type { ToolsPlatform } from '../tools/toolsPlatform.js';
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
  delete: DeletePlatform;
  scan: ScanPlatform;
  system: SystemPlatform;
  explore: ExplorePlatform;
  tools: ToolsPlatform;
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
    probePlatform: {
      explore: params.explore,
      homebrewPrefixPaths: params.tools.homebrewPrefixPaths,
      privacyDenialCode: params.system.privacyDenialCode,
    },
    isEntryEvicted: params.system.isEntryEvicted,
    loadProcessCommands: () => loadCurrentProcessCommands({ scan: params.scan }),
    clock: params.clock,
  });

  return { kind: 'succeeded', value: { run: run, logPath: journal.value.logPath } };
}

/** `null` when the process listing failed, which withholds every item whose owner it would name. */
async function loadCurrentProcessCommands(params: {
  scan: ScanPlatform;
}): Promise<string[] | null> {
  const processCommands = await params.scan.loadRunningProcesses({
    commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
  });

  return processCommands.kind === 'succeeded' ? processCommands.value : null;
}
