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
import { formatToolFailureStderrLines, formatToolFailureSummary } from './formatToolFailure.js';

const outcomeTexts: Record<RemovalOutcomeKind, string> = {
  removed: 'deleted',
  alreadyGone: 'already gone',
  changedSinceScan: 'changed since the scan, left alone',
  ownerRunning: 'its app or tool is running now, left alone',
  permissionDenied: 'permission denied',
  failed: 'failed',
  notAttempted: 'not attempted',
  toolFailed: 'its tool failed',
  engineInUse: 'its engine still uses it, left alone',
  engineNotRunning: 'its engine is not running, left alone',
};

export function formatRemovalRun(params: { run: RemovalRun }): string[] {
  return [
    ...params.run.outcomes.flatMap((outcome) => formatOutcomeLines({ outcome: outcome })),
    formatFreedSummaryLine({ outcomes: params.run.outcomes }),
    ...formatReturnsLaterLines({ outcomes: params.run.outcomes }),
    ...formatUnremovedSummaryLines({ outcomes: params.run.outcomes }),
    ...formatJournalFailureLines({ journalFailure: params.run.journalFailure }),
  ];
}

/** The free space of the home folder's volume after a run. */
export function formatAvailableSpaceLine(params: { availableBytes: number }): string {
  return `${formatBytes(params.availableBytes)} is free on this disk now.`;
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
  const stderrLines = formatToolFailureStderrLines({ failure: params.outcome.failure });

  return [
    `- ${outcomeTexts.toolFailed}: ${formatDisplayText({ text: params.outcome.path })} (${failureText})`,
    ...stderrLines.map((line) => `   ${line}`),
  ];
}

/**
 * Counts the space the disk got back, which a failed tool run may have partly freed, and the items
 * that gave it; an engine's space comes back only later, so `formatReturnsLaterLines` counts it
 * apart.
 */
function formatFreedSummaryLine(params: { outcomes: RemovalOutcome[] }): string {
  const hostOutcomes = params.outcomes.filter((outcome) => !isEngineOutcome(outcome));
  const removedCount = countOutcomesOfKind({ outcomes: hostOutcomes, kind: 'removed' });
  const freedBytes = sumFreedBytes({ outcomes: hostOutcomes });

  return `Freed about ${formatBytes(freedBytes)} in ${formatCount({ count: removedCount, singular: 'item', plural: 'items' })}.`;
}

/** What the engines freed inside their disk images, only when they freed any. */
function formatReturnsLaterLines(params: { outcomes: RemovalOutcome[] }): string[] {
  const returnsLaterBytes = sumFreedBytes({
    outcomes: params.outcomes.filter((outcome) => isEngineOutcome(outcome)),
  });

  if (returnsLaterBytes === 0) {
    return [];
  }

  return [
    `About ${formatBytes(returnsLaterBytes)} more comes back once the container engines give up the space of their disk images.`,
  ];
}

function isEngineOutcome(outcome: RemovalOutcome): boolean {
  return outcome.candidate.removal.kind === 'callEngine';
}

function sumFreedBytes(params: { outcomes: RemovalOutcome[] }): number {
  return params.outcomes.reduce((sum, outcome) => sum + outcome.freedBytes, 0);
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
