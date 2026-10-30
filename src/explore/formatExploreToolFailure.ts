import type { ToolCommandFailure } from '../tools/runToolCommand.js';
import type { ExploreToolFailure } from './exploreUnit.js';

/** One line that says how a tool failed, with the first line of its stderr when it left one. */
export function formatExploreToolFailure(failure: ExploreToolFailure): string {
  switch (failure.reason) {
    case 'commandFailed':
      return formatToolCommandFailure(failure.failure);
    case 'outputUnreadable':
      return `its output could not be read: ${failure.detail}`;
  }
}

function formatToolCommandFailure(failure: ToolCommandFailure): string {
  switch (failure.reason) {
    case 'exitedWithError':
      return appendFirstStderrLine({
        summary: `exited with code ${failure.exitCode}`,
        stderrTail: failure.stderrTail,
      });
    case 'endedBySignal':
      return appendFirstStderrLine({
        summary: `ended by signal ${failure.signal}`,
        stderrTail: failure.stderrTail,
      });
    case 'timedOut':
      return `did not answer within ${Math.round(failure.timeoutMs / 1000)} s`;
    case 'spawnFailed':
      return `could not start: ${failure.message}`;
    case 'outputTooLarge':
      return `printed more than ${Math.round(failure.maxOutputBytes / 1_048_576)} MB`;
  }
}

function appendFirstStderrLine(params: { summary: string; stderrTail: string }): string {
  const firstLine = params.stderrTail
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');

  if (firstLine === undefined) {
    return params.summary;
  }

  return `${params.summary}: ${firstLine}`;
}
