import type { FileHandle } from 'node:fs/promises';
import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { OwnerOnlyModes } from '../environment/buildEnvironment.js';
import type {
  ExploreEngineUnit,
  ExploreProbeFailure,
  ExploreToolFailure,
  ExploreToolUnit,
} from '../explore/exploreUnit.js';
import type { Result } from '../result.js';
import { getErrorCode } from '../system/getErrorCode.js';
import type { RemovalOutcomeCodedKind } from './deleteCandidates.js';
import type { ToolCandidateSkipReason } from './runToolCandidate.js';

export type JournalEntrySessionStart = { kind: 'sessionStart'; atMs: number };

/** Before an item of paths is deleted: its shown place and every target that goes with it. */
export type JournalEntryIntent = {
  kind: 'intent';
  atMs: number;
  path: string;
  allocatedBytes: number;
  targetPaths: string[];
};

/** One per target of a deleted item, after the deletion. */
export type JournalEntryOutcome = {
  kind: 'outcome';
  atMs: number;
  path: string;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
};

/** The target of a deleted item is gone but for `stayedEntryCount` entries, after the deletion. */
export type JournalEntryOutcomePartlyRemoved = {
  kind: 'outcome';
  atMs: number;
  path: string;
  outcome: 'partlyRemoved';
  stayedEntryCount: number;
};

/** Before the files of a folder are evicted; their copies stay with the cloud. */
export type JournalEntryEvictIntent = {
  kind: 'evictIntent';
  atMs: number;
  folderPath: string;
  targetPaths: string[];
};

/** One per file of an evicted item, after its evict was tried or withheld. */
export type JournalEntryEvictionCoded = {
  kind: 'eviction';
  atMs: number;
  path: string;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
};

/** The evict tool exited with an error for the file, which stays downloaded. */
export type JournalEntryEvictionToolFailed = {
  kind: 'eviction';
  atMs: number;
  path: string;
  outcome: 'toolFailed';
  failure: ExploreToolFailure;
};

/** Before an engine removes a unit: never a host path, only what the engine names it by. */
export type JournalEntryEngineIntent = {
  kind: 'engineIntent';
  atMs: number;
  engineName: string;
  unitKind: ExploreEngineUnit['kind'];
  unitIds: string[];
};

/** After the engine was called; `status` is its HTTP answer, `null` when none came. */
export type JournalEntryEngineCall = {
  kind: 'engineCall';
  atMs: number;
  engineName: string;
  unitKind: ExploreEngineUnit['kind'];
  unitIds: string[];
  outcome: RemovalOutcomeCodedKind;
  status: number | null;
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
  | JournalEntryOutcomePartlyRemoved
  | JournalEntryToolIntent
  | JournalEntryToolOutcomeRemoved
  | JournalEntryToolOutcomeSkipped
  | JournalEntryToolOutcomeToolFailed
  | JournalEntryEvictIntent
  | JournalEntryEvictionCoded
  | JournalEntryEvictionToolFailed
  | JournalEntryEngineIntent
  | JournalEntryEngineCall;

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

/**
 * Creates the log folder and writes the session start, so a journal that cannot record fails here.
 * Creates the folder and the log with `ownerOnlyModes`, or with the system's defaults for `null`.
 */
export async function createDeletionJournal(params: {
  logPath: string;
  ownerOnlyModes: OwnerOnlyModes | null;
  nowMs: number;
}): Promise<Result<DeletionJournal, JournalFailure>> {
  const directoryCreated = await createJournalDirectory({
    path: dirname(params.logPath),
    mode: params.ownerOnlyModes?.directoryMode ?? null,
  });

  if (directoryCreated.kind === 'failed') {
    return directoryCreated;
  }

  const fileMode = params.ownerOnlyModes?.fileMode ?? null;
  const sessionStarted = await appendJournalEntry({
    logPath: params.logPath,
    fileMode: fileMode,
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
        appendJournalEntry({
          logPath: params.logPath,
          fileMode: fileMode,
          entry: appendParams.entry,
        }),
    },
  };
}

export function formatJournalLine(params: { entry: JournalEntry }): string {
  return `${JSON.stringify(params.entry)}\n`;
}

/** `mode` `null` creates the folder with the system's default. */
async function createJournalDirectory(params: {
  path: string;
  mode: number | null;
}): Promise<Result<null, JournalFailure>> {
  try {
    await mkdir(params.path, {
      recursive: true,
      ...(params.mode === null ? {} : { mode: params.mode }),
    });

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
  fileMode: number | null;
  entry: JournalEntry;
}): Promise<Result<null, JournalFailure>> {
  const opened = await openJournalFile({ logPath: params.logPath, fileMode: params.fileMode });

  if (opened.kind === 'failed') {
    return opened;
  }

  return writeJournalLine({
    handle: opened.value,
    logPath: params.logPath,
    line: formatJournalLine({ entry: params.entry }),
  });
}

/** `fileMode` `null` creates the log with the system's default. */
async function openJournalFile(params: {
  logPath: string;
  fileMode: number | null;
}): Promise<Result<FileHandle, JournalFailure>> {
  try {
    const handle = await open(params.logPath, 'a', params.fileMode ?? undefined);

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
