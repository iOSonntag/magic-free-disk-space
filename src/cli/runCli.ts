import type { CatalogEntry } from '../catalog/catalog.js';
import { deleteCandidates } from '../delete/deleteCandidates.js';
import { createDeletionJournal } from '../delete/deletionJournal.js';
import { planRemoval } from '../delete/planRemoval.js';
import type { Environment } from '../environment/buildEnvironment.js';
import { formatArgumentFailure, formatSelectionFailure } from '../report/formatInputFailures.js';
import { formatRemovalPlan } from '../report/formatRemovalPlan.js';
import { formatRemovalRun } from '../report/formatRemovalRun.js';
import { formatScanReport } from '../report/formatScanReport.js';
import { formatUsage } from '../report/formatUsage.js';
import { SCAN_LIMITS } from '../scan/limits.js';
import { loadProcessCommands } from '../scan/loadProcessCommands.js';
import type { ScanReport } from '../scan/runScan.js';
import { runScan } from '../scan/runScan.js';
import { DELETE_CONFIRMATION_WORD, isDeleteConfirmation } from './confirmation.js';
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

  const plan = planRemoval({
    ranked: params.report.candidates,
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
    params.io.writeOut('Cancelled. Nothing was deleted.\n');

    return EXIT_CODES.done;
  }

  const plan = planRemoval({
    ranked: params.report.candidates,
    selectedNumbers: selectedNumbers,
    environment: params.environment,
  });

  writeLines({ io: params.io, lines: ['', ...formatRemovalPlan({ plan: plan })] });

  if (plan.approved.length === 0) {
    params.io.writeOut('Nothing was deleted.\n');

    return EXIT_CODES.done;
  }

  const confirmation = await params.io.readLine(
    `\nThis cannot be undone: the items do not go to the Trash.\nType ${DELETE_CONFIRMATION_WORD} to delete them permanently, or anything else to cancel.\n> `,
  );

  if (confirmation === null || !isDeleteConfirmation({ line: confirmation })) {
    params.io.writeOut('Cancelled. Nothing was deleted.\n');

    return EXIT_CODES.done;
  }

  const journal = await createDeletionJournal({
    logPath: params.environment.deletionLogPath,
    nowMs: Date.now(),
  });

  if (journal.kind === 'failed') {
    params.io.writeError(
      `Cannot write the deletion log at ${journal.failure.path} (${journal.failure.code}). Nothing was deleted.\n`,
    );

    return EXIT_CODES.journalUnavailable;
  }

  // Read again now: the scan took minutes, and an app may have started since.
  const processCommands = await loadProcessCommands({
    commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
  });
  const run = await deleteCandidates({
    candidates: plan.approved,
    journal: journal.value,
    processCommands: processCommands.kind === 'succeeded' ? processCommands.value : null,
    clock: () => Date.now(),
  });

  writeLines({ io: params.io, lines: ['', ...formatRemovalRun({ run: run })] });
  params.io.writeOut(`The deletion log is at ${journal.value.logPath}\n`);

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

function buildSelectionChoices(params: { report: ScanReport }): SelectionChoice[] {
  return params.report.candidates.map((candidate, index) => ({
    number: index + 1,
    risk: candidate.risk,
  }));
}

function writeLines(params: { io: TerminalIo; lines: string[] }): void {
  params.io.writeOut(`${params.lines.join('\n')}\n`);
}
