import { SCAN_LIMITS } from '../scan/limits.js';
import type { ProcessEndSignalExit } from '../tools/toolsPlatform.js';
import type { ReportTexts } from './reportTexts.js';

/** The help of the CLI, its exit codes ending with those of the signals that end the app. */
export function formatUsage(params: {
  texts: ReportTexts;
  processEndSignals: ProcessEndSignalExit[];
}): string[] {
  const exitCodeTexts = [
    '0 done or cancelled',
    '1 a deletion failed or the log stopped the run',
    `2 bad usage, not ${params.texts.systemName}, or an unsafe setup`,
    '3 no interactive terminal',
    '4 the deletion log could not be created',
    ...formatSignalExitCodeTexts({ processEndSignals: params.processEndSignals }),
  ];

  return [
    'Usage: bun start [options]',
    `Finds storage leftovers on ${params.texts.computerPhrase} and permanently deletes the ones you select.`,
    '',
    'Options:',
    '  --list                 Show what could be freed, then exit. Deletes nothing.',
    '  --dry-run              Scan and show the removal plan. Deletes nothing.',
    '  --select <selection>   With --dry-run: the items to plan, such as "1-3,7" or "safe".',
    `  --stale-days <days>    Days without changes before temporary folders, app logs, project build folders, installers and unfinished downloads, and Mail's attachment copies count as stale (default ${SCAN_LIMITS.defaultStaleDays}).`,
    `  --unused-days <days>   Days without use before apps, large files, the data of removed apps, iCloud Drive files, simulator runtimes, and Android emulators count as unused (default ${SCAN_LIMITS.defaultUnusedDays}).`,
    '  -h, --help             Show this help.',
    '',
    `Exit codes: ${exitCodeTexts.join(', ')}.`,
  ];
}

/** The codes of the signals together, as "130, 143 stopped by SIGINT or SIGTERM"; none without a signal. */
function formatSignalExitCodeTexts(params: {
  processEndSignals: ProcessEndSignalExit[];
}): string[] {
  if (params.processEndSignals.length === 0) {
    return [];
  }

  const codesText = params.processEndSignals.map((exit) => exit.exitCode).join(', ');
  const signalsText = formatAlternatives({
    words: params.processEndSignals.map((exit) => exit.signal),
  });

  return [`${codesText} stopped by ${signalsText}`];
}

/** The words as alternatives: "A", "A or B", or "A, B, or C". */
function formatAlternatives(params: { words: string[] }): string {
  if (params.words.length <= 2) {
    return params.words.join(' or ');
  }

  return `${params.words.slice(0, -1).join(', ')}, or ${params.words.at(-1)}`;
}
