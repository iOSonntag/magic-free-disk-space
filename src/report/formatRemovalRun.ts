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
import { formatCandidateItemText } from './formatCandidateItemText.js';
import { formatCount } from './formatCount.js';
import { formatToolFailureStderrLines, formatToolFailureSummary } from './formatToolFailure.js';
import { isEngineOutcome, sumFreedSpace } from './sumFreedSpace.js';

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
  const freedSpace = sumFreedSpace(params.run.outcomes);

  return [
    ...params.run.outcomes.flatMap((outcome) => formatOutcomeLines({ outcome: outcome })),
    formatFreedSummaryLine({
      outcomes: params.run.outcomes,
      freedBytes: freedSpace.freedBytes,
    }),
    ...formatReturnsLaterLines({ returnsLaterBytes: freedSpace.returnsLaterBytes }),
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

  return `- ${outcomeTexts[params.outcome.outcome]}: ${formatCandidateItemText({ candidate: params.outcome.candidate })}${codeText}`;
}

/** The failure in short, then the end of what the tool wrote to stderr when it wrote any. */
function formatToolFailedLines(params: { outcome: RemovalOutcomeToolFailed }): string[] {
  const failureText = formatToolFailureSummary({ failure: params.outcome.failure });
  const stderrLines = formatToolFailureStderrLines({ failure: params.outcome.failure });

  return [
    `- ${outcomeTexts.toolFailed}: ${formatCandidateItemText({ candidate: params.outcome.candidate })} (${failureText})`,
    ...stderrLines.map((line) => `   ${line}`),
  ];
}

/**
 * Counts the space the disk got back, which a failed tool run may have partly freed, and the items
 * that gave it; an engine's space comes back only later, so `formatReturnsLaterLines` counts it
 * apart.
 */
function formatFreedSummaryLine(params: {
  outcomes: RemovalOutcome[];
  freedBytes: number;
}): string {
  const removedCount = countOutcomesOfKind({
    outcomes: params.outcomes.filter((outcome) => !isEngineOutcome(outcome)),
    kind: 'removed',
  });

  return `Freed about ${formatBytes(params.freedBytes)} in ${formatCount({ count: removedCount, singular: 'item', plural: 'items' })}.`;
}

/** What the engines freed inside their disk images, only when they freed any. */
function formatReturnsLaterLines(params: { returnsLaterBytes: number }): string[] {
  if (params.returnsLaterBytes === 0) {
    return [];
  }

  return [
    `About ${formatBytes(params.returnsLaterBytes)} more comes back within minutes, once the container engines give up the space of their disk images.`,
  ];
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
