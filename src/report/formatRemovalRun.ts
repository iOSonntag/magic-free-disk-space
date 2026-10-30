import type {
  RemovalOutcome,
  RemovalOutcomeCoded,
  RemovalOutcomeKind,
  RemovalOutcomeToolFailed,
  RemovalRun,
} from '../delete/deleteCandidates.js';
import type { JournalFailure } from '../delete/deletionJournal.js';
import type { ExploreToolFailure } from '../explore/exploreUnit.js';
import type { ToolCommandFailure } from '../tools/runToolCommand.js';
import { formatBytes } from './formatBytes.js';
import { formatCount } from './formatCount.js';
import { formatDisplayText } from './formatDisplayText.js';

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

const MS_PER_SECOND = 1000;

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
  const failureText = formatExploreToolFailureText({ failure: params.outcome.failure });
  const lines = [
    `- ${outcomeTexts.toolFailed}: ${formatDisplayText({ text: params.outcome.path })} (${failureText})`,
  ];
  const stderrTail = findStderrTail({ failure: params.outcome.failure }).trim();

  if (stderrTail !== '') {
    lines.push(`   ${formatDisplayText({ text: stderrTail })}`);
  }

  return lines;
}

function formatExploreToolFailureText(params: { failure: ExploreToolFailure }): string {
  switch (params.failure.reason) {
    case 'commandFailed':
      return formatToolCommandFailureText({ failure: params.failure.failure });
    case 'outputUnreadable':
      return `its output could not be read: ${formatDisplayText({ text: params.failure.detail })}`;
  }
}

function formatToolCommandFailureText(params: { failure: ToolCommandFailure }): string {
  switch (params.failure.reason) {
    case 'exitedWithError':
      return `exit code ${params.failure.exitCode}`;
    case 'endedBySignal':
      return `ended by signal ${formatDisplayText({ text: params.failure.signal })}`;
    case 'timedOut':
      return `stopped at its time limit of ${Math.round(params.failure.timeoutMs / MS_PER_SECOND)} s`;
    case 'spawnFailed':
      return `could not start: ${formatDisplayText({ text: params.failure.message })}`;
    case 'outputTooLarge':
      return `stopped when its output passed ${formatBytes(params.failure.maxOutputBytes)}`;
  }
}

function findStderrTail(params: { failure: ExploreToolFailure }): string {
  if (params.failure.reason === 'outputUnreadable') {
    return '';
  }

  switch (params.failure.failure.reason) {
    case 'exitedWithError':
    case 'endedBySignal':
    case 'timedOut':
    case 'outputTooLarge':
      return params.failure.failure.stderrTail;
    case 'spawnFailed':
      return '';
  }
}

/** Counts the space every outcome gave back, which a failed tool run may have partly freed. */
function formatFreedSummaryLine(params: { outcomes: RemovalOutcome[] }): string {
  const removedCount = countOutcomesOfKind({ outcomes: params.outcomes, kind: 'removed' });
  const freedBytes = params.outcomes.reduce((sum, outcome) => sum + outcome.freedBytes, 0);

  return `Freed about ${formatBytes(freedBytes)} in ${formatCount({ count: removedCount, singular: 'item', plural: 'items' })}.`;
}

function formatUnremovedSummaryLines(params: { outcomes: RemovalOutcome[] }): string[] {
  const unremovedCount =
    countOutcomesOfKind({ outcomes: params.outcomes, kind: 'permissionDenied' }) +
    countOutcomesOfKind({ outcomes: params.outcomes, kind: 'failed' }) +
    countOutcomesOfKind({ outcomes: params.outcomes, kind: 'toolFailed' });
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
