import type { RemovalOutcome, RemovalOutcomeKind, RemovalRun } from '../delete/deleteCandidates.js';
import type { JournalFailure } from '../delete/deletionJournal.js';
import { formatBytes } from './formatBytes.js';
import { formatCount } from './formatCount.js';

const outcomeTexts: Record<RemovalOutcomeKind, string> = {
  removed: 'deleted',
  alreadyGone: 'already gone',
  changedSinceScan: 'changed since the scan, left alone',
  ownerRunning: 'its app is running now, left alone',
  permissionDenied: 'permission denied',
  failed: 'failed',
  notAttempted: 'not attempted',
};

export function formatRemovalRun(params: { run: RemovalRun }): string[] {
  return [
    ...params.run.outcomes.map((outcome) => formatOutcomeLine({ outcome: outcome })),
    formatFreedSummaryLine({ outcomes: params.run.outcomes }),
    ...formatUnremovedSummaryLines({ outcomes: params.run.outcomes }),
    ...formatJournalFailureLines({ journalFailure: params.run.journalFailure }),
  ];
}

function formatOutcomeLine(params: { outcome: RemovalOutcome }): string {
  const codeText = params.outcome.code === null ? '' : ` (${params.outcome.code})`;

  return `- ${outcomeTexts[params.outcome.outcome]}: ${params.outcome.path}${codeText}`;
}

function formatFreedSummaryLine(params: { outcomes: RemovalOutcome[] }): string {
  const removedOutcomes = findOutcomesOfKind({ outcomes: params.outcomes, kind: 'removed' });
  const freedBytes = removedOutcomes.reduce((sum, outcome) => sum + outcome.allocatedBytes, 0);

  return `Freed about ${formatBytes(freedBytes)} in ${formatCount({ count: removedOutcomes.length, singular: 'item', plural: 'items' })}.`;
}

function formatUnremovedSummaryLines(params: { outcomes: RemovalOutcome[] }): string[] {
  const permissionDeniedCount = findOutcomesOfKind({
    outcomes: params.outcomes,
    kind: 'permissionDenied',
  }).length;
  const failedCount = findOutcomesOfKind({ outcomes: params.outcomes, kind: 'failed' }).length;
  const notAttemptedCount = findOutcomesOfKind({
    outcomes: params.outcomes,
    kind: 'notAttempted',
  }).length;
  const unremovedCount = permissionDeniedCount + failedCount;
  const lines: string[] = [];

  if (unremovedCount > 0) {
    lines.push(
      `${formatCount({ count: unremovedCount, singular: 'item', plural: 'items' })} could not be deleted.`,
    );
  }

  if (notAttemptedCount > 0) {
    lines.push(
      `${formatCount({ count: notAttemptedCount, singular: 'item was', plural: 'items were' })} not attempted.`,
    );
  }

  return lines;
}

function findOutcomesOfKind(params: {
  outcomes: RemovalOutcome[];
  kind: RemovalOutcomeKind;
}): RemovalOutcome[] {
  return params.outcomes.filter((outcome) => outcome.outcome === params.kind);
}

function formatJournalFailureLines(params: { journalFailure: JournalFailure | null }): string[] {
  if (params.journalFailure === null) {
    return [];
  }

  return [
    `The deletion log failed (${params.journalFailure.reason} at ${params.journalFailure.path}: ${params.journalFailure.code}), so the run stopped.`,
  ];
}
