import type { JournalFailure } from '../delete/deletionJournal.js';
import { formatDisplayText } from './formatDisplayText.js';

export function formatDeletionLogLine(params: { logPath: string }): string {
  return `The deletion log is at ${formatDisplayText({ text: params.logPath })}`;
}

export function formatJournalUnavailableText(params: { failure: JournalFailure }): string {
  return `Cannot write the deletion log at ${formatDisplayText({ text: params.failure.path })} (${params.failure.code}). Nothing was deleted.`;
}
