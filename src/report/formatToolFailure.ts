import type { ExploreToolFailure } from '../explore/exploreUnit.js';
import type { ToolCommandFailure } from '../tools/runToolCommand.js';
import { formatBytes } from './formatBytes.js';
import { formatDisplayText } from './formatDisplayText.js';

const MS_PER_SECOND = 1000;

/** How a tool failed, in the one wording the scan and the run share; safe to show. */
export function formatToolFailureSummary(params: { failure: ExploreToolFailure }): string {
  switch (params.failure.reason) {
    case 'commandFailed':
      return formatToolCommandFailureSummary({ failure: params.failure.failure });
    case 'outputUnreadable':
      return `its output could not be read: ${formatDisplayText({ text: params.failure.detail })}`;
  }
}

/** The first line of the tool's stderr with text on it, safe to show; `null` when there is none. */
export function formatToolFailureFirstStderrLine(params: {
  failure: ExploreToolFailure;
}): string | null {
  const [firstLine] = formatToolFailureStderrLines({ failure: params.failure });

  return firstLine ?? null;
}

/** Each line with text on it of the end of the tool's stderr, trimmed and safe to show. */
export function formatToolFailureStderrLines(params: { failure: ExploreToolFailure }): string[] {
  return getStderrTail({ failure: params.failure })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => formatDisplayText({ text: line }));
}

function formatToolCommandFailureSummary(params: { failure: ToolCommandFailure }): string {
  switch (params.failure.reason) {
    case 'exitedWithError':
      return `exited with code ${params.failure.exitCode}`;
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

/** Empty for a failure that leaves no stderr: a tool that never started or output never parsed. */
function getStderrTail(params: { failure: ExploreToolFailure }): string {
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
