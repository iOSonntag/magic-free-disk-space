import type { CatalogEntry } from '../catalog/catalog.js';
import { isDeleteConfirmation } from '../delete/confirmation.js';
import { deleteApprovedCandidates } from '../delete/deleteApprovedCandidates.js';
import type { RemovalPlan } from '../delete/planRemoval.js';
import { planRemoval } from '../delete/planRemoval.js';
import type { Environment } from '../environment/buildEnvironment.js';
import {
  CANCELLED_TEXT,
  formatDeletionWarningLines,
} from '../report/formatDeletionConfirmation.js';
import {
  formatDeletionLogLine,
  formatJournalUnavailableText,
} from '../report/formatDeletionLog.js';
import { formatArgumentFailure, formatSelectionFailure } from '../report/formatInputFailures.js';
import { formatRemovalPlan } from '../report/formatRemovalPlan.js';
import { formatRemovalRun } from '../report/formatRemovalRun.js';
import { formatScanReport } from '../report/formatScanReport.js';
import { formatUsage } from '../report/formatUsage.js';
import type { ScanReport } from '../scan/runScan.js';
import { runScan } from '../scan/runScan.js';
import { EXIT_CODES } from './exitCodes.js';
import type { CliArguments } from './parseArguments.js';
import { parseArguments } from './parseArguments.js';
import type { SelectionChoice } from './parseSelection.js';
import { parseSelection } from './parseSelection.js';
import type { TerminalIo } from './terminalIo.js';

const SELECTION_PROMPT =
  'Select items to delete: numbers and ranges such as "1-3, 7", "safe" for every safe item, or "none". Press Enter alone to cancel.\n> ';

/**
 * Runs the tool and returns its exit code. Nothing is deleted unless the user selects items in
 * an interactive terminal and then types the confirmation word.
 */
export async function runCli(params: {
  argv: string[];
  environment: Environment;
  catalogEntries: CatalogEntry[];
  io: TerminalIo;
}): Promise<number> {
  if (params.environment.platform !== 'darwin') {
    params.io.writeError('This tool runs on macOS only.\n');

    return EXIT_CODES.cannotStart;
  }

  const parsed = parseArguments({ argv: params.argv });

  if (parsed.kind === 'failed') {
    params.io.writeError(
      `${formatArgumentFailure({ failure: parsed.failure })}\nRun with --help for usage.\n`,
    );

    return EXIT_CODES.cannotStart;
  }

  const mode = parsed.value.mode;

  if (mode.kind === 'help') {
    writeLines({ io: params.io, lines: formatUsage() });

    return EXIT_CODES.done;
  }

  // Refused before the scan, so a piped run never reaches a prompt it cannot answer.
  if (mode.kind === 'interactive' && !params.io.isTerminal) {
    params.io.writeError(
      'Deleting needs an interactive terminal. Use --list or --dry-run to look without deleting.\n',
    );

    return EXIT_CODES.notInteractive;
  }

  const report = await runScan({
    environment: params.environment,
    catalogEntries: params.catalogEntries,
    options: { staleDays: parsed.value.staleDays, unusedDays: parsed.value.unusedDays },
    onProgress: (message) => {
      params.io.writeError(`${message}\n`);
    },
  });

  writeLines({ io: params.io, lines: formatScanReport({ report: report }) });

  if (mode.kind === 'list') {
    return EXIT_CODES.done;
  }

  if (mode.kind === 'dryRun') {
    return runDryRun({
      environment: params.environment,
      io: params.io,
      report: report,
      selectionSpec: mode.selectionSpec,
    });
  }

  return runInteractiveDeletion({
    arguments: parsed.value,
    environment: params.environment,
    io: params.io,
    report: report,
  });
}

function runDryRun(params: {
  environment: Environment;
  io: TerminalIo;
  report: ScanReport;
  selectionSpec: string | null;
}): number {
  if (params.selectionSpec === null) {
    params.io.writeOut('\nAdd --select <selection> to see what a deletion would remove.\n');

    return EXIT_CODES.done;
  }

  const selection = parseSelection({
    input: params.selectionSpec,
    choices: buildSelectionChoices({ report: params.report }),
  });

  if (selection.kind === 'failed') {
    params.io.writeError(`${formatSelectionFailure({ failure: selection.failure })}\n`);

    return EXIT_CODES.cannotStart;
  }

  const plan = planParsedSelection({
    report: params.report,
    selectedNumbers: selection.value,
    environment: params.environment,
  });

  writeLines({ io: params.io, lines: ['', ...formatRemovalPlan({ plan: plan })] });
  params.io.writeOut('\nDry run: nothing was deleted.\n');

  return EXIT_CODES.done;
}

async function runInteractiveDeletion(params: {
  arguments: CliArguments;
  environment: Environment;
  io: TerminalIo;
  report: ScanReport;
}): Promise<number> {
  if (params.report.candidates.length === 0) {
    return EXIT_CODES.done;
  }

  const selectedNumbers = await readSelection({ io: params.io, report: params.report });

  if (selectedNumbers === null || selectedNumbers.length === 0) {
    params.io.writeOut(`${CANCELLED_TEXT}\n`);

    return EXIT_CODES.done;
  }

  const plan = planParsedSelection({
    report: params.report,
    selectedNumbers: selectedNumbers,
    environment: params.environment,
  });

  writeLines({ io: params.io, lines: ['', ...formatRemovalPlan({ plan: plan })] });

  if (plan.approved.length === 0) {
    params.io.writeOut('Nothing was deleted.\n');

    return EXIT_CODES.done;
  }

  const warningText = formatDeletionWarningLines().join('\n');
  const confirmation = await params.io.readLine(`\n${warningText}\n> `);

  if (confirmation === null || !isDeleteConfirmation({ confirmation: confirmation })) {
    params.io.writeOut(`${CANCELLED_TEXT}\n`);

    return EXIT_CODES.done;
  }

  const removal = await deleteApprovedCandidates({
    plan: plan,
    deletionLogPath: params.environment.deletionLogPath,
    clock: () => Date.now(),
  });

  if (removal.kind === 'failed') {
    params.io.writeError(`${formatJournalUnavailableText({ failure: removal.failure })}\n`);

    return EXIT_CODES.journalUnavailable;
  }

  const run = removal.value.run;

  writeLines({
    io: params.io,
    lines: [
      '',
      ...formatRemovalRun({ run: run }),
      formatDeletionLogLine({ logPath: removal.value.logPath }),
    ],
  });

  const hasFailure =
    run.journalFailure !== null ||
    run.outcomes.some(
      (outcome) => outcome.outcome === 'permissionDenied' || outcome.outcome === 'failed',
    );

  if (hasFailure) {
    return EXIT_CODES.removalFailed;
  }

  return EXIT_CODES.done;
}

/** Asks until the input parses; returns `null` when the input ends. */
async function readSelection(params: {
  io: TerminalIo;
  report: ScanReport;
}): Promise<number[] | null> {
  const choices = buildSelectionChoices({ report: params.report });

  while (true) {
    const line = await params.io.readLine(`\n${SELECTION_PROMPT}`);

    if (line === null) {
      return null;
    }

    const selection = parseSelection({ input: line, choices: choices });

    if (selection.kind === 'succeeded') {
      return selection.value;
    }

    params.io.writeError(`${formatSelectionFailure({ failure: selection.failure })}\n`);
  }
}

/** Throws when a number lies outside the ranking, which `parseSelection` already ruled out. */
function planParsedSelection(params: {
  report: ScanReport;
  selectedNumbers: number[];
  environment: Environment;
}): RemovalPlan {
  const planned = planRemoval({
    ranked: params.report.candidates,
    selectedNumbers: params.selectedNumbers,
    environment: params.environment,
  });

  if (planned.kind === 'failed') {
    throw new Error(`Parsed selection names ${planned.failure.number}, outside the ranking`);
  }

  return planned.value;
}

function buildSelectionChoices(params: { report: ScanReport }): SelectionChoice[] {
  return params.report.candidates.map((candidate, index) => ({
    number: index + 1,
    risk: candidate.risk,
  }));
}

function writeLines(params: { io: TerminalIo; lines: string[] }): void {
  params.io.writeOut(`${params.lines.join('\n')}\n`);
}
