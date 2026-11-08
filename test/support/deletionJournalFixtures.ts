import { readFile } from 'node:fs/promises';
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

/** The lines of the deletion log at `logPath`, each read back as JSON nobody checked yet. */
export async function loadTestJournalLines(params: { logPath: string }): Promise<unknown[]> {
  return (await readFile(params.logPath, 'utf8'))
    .trimEnd()
    .split('\n')
    .map((line): unknown => JSON.parse(line));
}
