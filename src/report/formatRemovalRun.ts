import type {
  RemovalOutcome,
  RemovalOutcomeCoded,
  RemovalOutcomeKind,
  RemovalOutcomeToolFailed,
  RemovalRun,
} from '../delete/deleteCandidates.js';
import { isUnremovedOutcome } from '../delete/deleteCandidates.js';
import type { JournalFailure } from '../delete/deletionJournal.js';
import { formatBytes } from './formatBytes.js';
import { formatCount } from './formatCount.js';
import { formatDisplayText } from './formatDisplayText.js';
import { formatToolFailureStderrTail, formatToolFailureSummary } from './formatToolFailure.js';

const outcomeTexts: Record<RemovalOutcomeKind, string> = {
  removed: 'deleted',
  alreadyGone: 'already gone',
  changedSinceScan: 'changed since the scan, left alone',
  ownerRunning: 'its app or tool is running now, left alone',
  permissionDenied: 'permission denied',
  failed: 'failed',
  notAttempted: 'not attempted',
  toolFailed: 'its tool failed',
};

export function formatRemovalRun(params: { run: RemovalRun }): string[] {
  return [
    ...params.run.outcomes.flatMap((outcome) => formatOutcomeLines({ outcome: outcome })),
    formatFreedSummaryLine({ outcomes: params.run.outcomes }),
    ...formatUnremovedSummaryLines({ outcomes: params.run.outcomes }),
    ...formatJournalFailureLines({ journalFailure: params.run.journalFailure }),
  ];
}

function formatOutcomeLines(params: { outcome: RemovalOutcome }): string[] {
  if (params.outcome.outcome === 'toolFailed') {
    return formatToolFailedLines({ outcome: params.outcome });
  }

  return [formatCodedOutcomeLine({ outcome: params.outcome })];
}

function formatCodedOutcomeLine(params: { outcome: RemovalOutcomeCoded }): string {
  const codeText = params.outcome.code === null ? '' : ` (${params.outcome.code})`;

  return `- ${outcomeTexts[params.outcome.outcome]}: ${formatDisplayText({ text: params.outcome.path })}${codeText}`;
}

/** The failure in short, then the end of what the tool wrote to stderr when it wrote any. */
function formatToolFailedLines(params: { outcome: RemovalOutcomeToolFailed }): string[] {
  const failureText = formatToolFailureSummary({ failure: params.outcome.failure });
  const lines = [
    `- ${outcomeTexts.toolFailed}: ${formatDisplayText({ text: params.outcome.path })} (${failureText})`,
  ];
  const stderrTail = formatToolFailureStderrTail({ failure: params.outcome.failure });

  if (stderrTail !== null) {
    lines.push(`   ${stderrTail}`);
  }

  return lines;
}

/** Counts the space every outcome gave back, which a failed tool run may have partly freed. */
function formatFreedSummaryLine(params: { outcomes: RemovalOutcome[] }): string {
  const removedCount = countOutcomesOfKind({ outcomes: params.outcomes, kind: 'removed' });
  const freedBytes = params.outcomes.reduce((sum, outcome) => sum + outcome.freedBytes, 0);

  return `Freed about ${formatBytes(freedBytes)} in ${formatCount({ count: removedCount, singular: 'item', plural: 'items' })}.`;
}

function formatUnremovedSummaryLines(params: { outcomes: RemovalOutcome[] }): string[] {
  const unremovedCount = params.outcomes.filter((outcome) =>
    isUnremovedOutcome(outcome.outcome),
  ).length;
  const notAttemptedCount = countOutcomesOfKind({
    outcomes: params.outcomes,
    kind: 'notAttempted',
  });
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

function countOutcomesOfKind(params: {
  outcomes: RemovalOutcome[];
  kind: RemovalOutcomeKind;
}): number {
  return params.outcomes.filter((outcome) => outcome.outcome === params.kind).length;
}

function formatJournalFailureLines(params: { journalFailure: JournalFailure | null }): string[] {
  if (params.journalFailure === null) {
    return [];
  }

  return [
    `The deletion log failed (${params.journalFailure.reason} at ${params.journalFailure.path}: ${params.journalFailure.code}), so the run stopped.`,
  ];
}
