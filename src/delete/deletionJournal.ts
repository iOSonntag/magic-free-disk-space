import type { FileHandle } from 'node:fs/promises';
import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExploreProbeFailure, ExploreToolUnit } from '../explore/exploreUnit.js';
import type { Result } from '../result.js';
import { getErrorCode } from '../system/getErrorCode.js';
import type { RemovalOutcomeCodedKind } from './deleteCandidates.js';
import type { ToolCandidateSkipReason } from './runToolCandidate.js';

export type JournalEntrySessionStart = { kind: 'sessionStart'; atMs: number };

export type JournalEntryIntent = {
  kind: 'intent';
  atMs: number;
  path: string;
  allocatedBytes: number;
};

export type JournalEntryOutcome = {
  kind: 'outcome';
  atMs: number;
  path: string;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
};

/**
 * `args` are every argument the tool runs with, its leading ones first, then the unit's command;
 * the unit holds the tool and its real path.
 */
export type JournalEntryToolIntent = {
  kind: 'toolIntent';
  atMs: number;
  path: string;
  allocatedBytes: number;
  unit: ExploreToolUnit;
  args: string[];
};

/** The unit's command ran and exited 0. */
export type JournalEntryToolOutcomeRemoved = {
  kind: 'toolOutcome';
  atMs: number;
  path: string;
  outcome: 'removed';
  exitCode: 0;
  stderrTail: string;
  freedBytes: number;
};

/** The unit's command did not run. */
export type JournalEntryToolOutcomeSkipped = {
  kind: 'toolOutcome';
  atMs: number;
  path: string;
  outcome: ToolCandidateSkipReason;
};

export type JournalEntryToolOutcomeToolFailed = {
  kind: 'toolOutcome';
  atMs: number;
  path: string;
  outcome: 'toolFailed';
  freedBytes: number;
  failure: ExploreProbeFailure;
};

export type JournalEntry =
  | JournalEntrySessionStart
  | JournalEntryIntent
  | JournalEntryOutcome
  | JournalEntryToolIntent
  | JournalEntryToolOutcomeRemoved
  | JournalEntryToolOutcomeSkipped
  | JournalEntryToolOutcomeToolFailed;

export type JournalFailure = {
  reason: 'directoryUnavailable' | 'cannotOpen' | 'writeFailed';
  path: string;
  code: string;
};

export type DeletionJournal = {
  logPath: string;
  /** Appends one line and waits until it is on disk. */
  append(params: { entry: JournalEntry }): Promise<Result<null, JournalFailure>>;
};

/** Creates the log folder and writes the session start, so a journal that cannot record fails here. */
export async function createDeletionJournal(params: {
  logPath: string;
  nowMs: number;
}): Promise<Result<DeletionJournal, JournalFailure>> {
  const directoryCreated = await createJournalDirectory({ path: dirname(params.logPath) });

  if (directoryCreated.kind === 'failed') {
    return directoryCreated;
  }

  const sessionStarted = await appendJournalEntry({
    logPath: params.logPath,
    entry: { kind: 'sessionStart', atMs: params.nowMs },
  });

  if (sessionStarted.kind === 'failed') {
    return sessionStarted;
  }

  return {
    kind: 'succeeded',
    value: {
      logPath: params.logPath,
      append: (appendParams) =>
        appendJournalEntry({ logPath: params.logPath, entry: appendParams.entry }),
    },
  };
}

export function formatJournalLine(params: { entry: JournalEntry }): string {
  return `${JSON.stringify(params.entry)}\n`;
}

async function createJournalDirectory(params: {
  path: string;
}): Promise<Result<null, JournalFailure>> {
  try {
    await mkdir(params.path, { recursive: true, mode: 0o700 });

    return { kind: 'succeeded', value: null };
  } catch (error) {
    return {
      kind: 'failed',
      failure: { reason: 'directoryUnavailable', path: params.path, code: getErrorCode(error) },
    };
  }
}

async function appendJournalEntry(params: {
  logPath: string;
  entry: JournalEntry;
}): Promise<Result<null, JournalFailure>> {
  const opened = await openJournalFile({ logPath: params.logPath });

  if (opened.kind === 'failed') {
    return opened;
  }

  return writeJournalLine({
    handle: opened.value,
    logPath: params.logPath,
    line: formatJournalLine({ entry: params.entry }),
  });
}

async function openJournalFile(params: {
  logPath: string;
}): Promise<Result<FileHandle, JournalFailure>> {
  try {
    const handle = await open(params.logPath, 'a', 0o600);

    return { kind: 'succeeded', value: handle };
  } catch (error) {
    return {
      kind: 'failed',
      failure: { reason: 'cannotOpen', path: params.logPath, code: getErrorCode(error) },
    };
  }
}

async function writeJournalLine(params: {
  handle: FileHandle;
  logPath: string;
  line: string;
}): Promise<Result<null, JournalFailure>> {
  try {
    await params.handle.write(params.line);
    await params.handle.datasync();
    await params.handle.close();

    return { kind: 'succeeded', value: null };
  } catch (error) {
    await params.handle.close().catch(() => undefined);

    return {
      kind: 'failed',
      failure: { reason: 'writeFailed', path: params.logPath, code: getErrorCode(error) },
    };
  }
}
