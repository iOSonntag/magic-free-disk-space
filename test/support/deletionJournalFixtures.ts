import type { DeletionJournal } from '../../src/delete/deletionJournal.js';
import { createDeletionJournal } from '../../src/delete/deletionJournal.js';

/**
 * A journal of the deletions at `logPath`, its clock at `nowMs`, written with the system's default
 * modes; throws when it cannot open.
 */
export async function createTestJournal(params: {
  logPath: string;
  nowMs: number;
}): Promise<DeletionJournal> {
  const journal = await createDeletionJournal({
    logPath: params.logPath,
    ownerOnlyModes: null,
    nowMs: params.nowMs,
  });

  if (journal.kind === 'failed') {
    throw new Error(`Journal failed: ${journal.failure.reason}`);
  }

  return journal.value;
}
