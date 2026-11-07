import type { DeletionJournal } from '../../src/delete/deletionJournal.js';
import { createDeletionJournal } from '../../src/delete/deletionJournal.js';

/** A journal of the deletions at `logPath`, its clock at `nowMs`; throws when it cannot open. */
export async function createTestJournal(params: {
  logPath: string;
  nowMs: number;
}): Promise<DeletionJournal> {
  const journal = await createDeletionJournal({ logPath: params.logPath, nowMs: params.nowMs });

  if (journal.kind === 'failed') {
    throw new Error(`Journal failed: ${journal.failure.reason}`);
  }

  return journal.value;
}
