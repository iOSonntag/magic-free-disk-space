import { realpath } from 'node:fs/promises';
import type { Result } from '../result.js';
import { getErrorCode } from '../system/getErrorCode.js';
import type { DirectoryEntry } from '../system/loadDirectoryEntries.js';
import { loadDirectoryEntries } from '../system/loadDirectoryEntries.js';
import type { DirectoryFailure } from '../system/loadDirectoryNames.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import type { EntryStats } from '../system/loadEntryStats.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import type { FileContentFailure } from '../system/loadFileBytes.js';
import type { FileFailure } from '../system/loadFileIdentity.js';
import { getFileFailure } from '../system/loadFileIdentity.js';
import { loadFileText } from '../system/loadFileText.js';
import type { ReadFailureVerdictAbsent, ReadFailureVerdictUnfit } from '../system/readFailure.js';
import { decideReadFailure } from '../system/readFailure.js';
import { runFilesystemCall } from '../system/runFilesystemCall.js';
import type { ExploreFileUnreadable } from './exploreUnit.js';
import { EXPLORE_FILE_MAX_BYTES } from './limits.js';

export type ExploreFileReadText = { kind: 'text'; text: string };

/** Nothing is there, or a part of the path is no folder. */
export type ExploreFileReadAbsent = { kind: 'absent' };

/** Something is there, but no file to read: another kind, or over `EXPLORE_FILE_MAX_BYTES`. */
export type ExploreFileReadUnfit = { kind: 'unfit' };

/** The text of a file a tool keeps, or the verdict of a read that found none to read. */
export type ExploreFileRead = ExploreFileReadText | ExploreFileReadAbsent | ExploreFileReadUnfit;

/** Reads a file a tool keeps, up to `EXPLORE_FILE_MAX_BYTES`; only a failed read fails, at its path. */
export async function loadExploreFileText(params: {
  path: string;
}): Promise<Result<ExploreFileRead, ExploreFileUnreadable>> {
  const text = await loadFileText({ path: params.path, maxBytes: EXPLORE_FILE_MAX_BYTES });

  if (text.kind === 'succeeded') {
    return { kind: 'succeeded', value: { kind: 'text', text: text.value } };
  }

  return decideExploreReadFailure({ path: params.path, failure: text.failure });
}

/** The sorted names in the folder; `null` when nothing is there or it is no folder. */
export async function loadExploreDirectoryNames(params: {
  path: string;
}): Promise<Result<string[] | null, ExploreFileUnreadable>> {
  const names = await loadDirectoryNames({ path: params.path });

  if (names.kind === 'succeeded') {
    return names;
  }

  return toNullWhenNotFound({ path: params.path, failure: names.failure });
}

/** The entries of the folder with their kinds; `null` when nothing is there or it is no folder. */
export async function loadExploreDirectoryEntries(params: {
  path: string;
}): Promise<Result<DirectoryEntry[] | null, ExploreFileUnreadable>> {
  const entries = await loadDirectoryEntries({ path: params.path });

  if (entries.kind === 'succeeded') {
    return entries;
  }

  return toNullWhenNotFound({ path: params.path, failure: entries.failure });
}

/** The stats of the entry itself; `null` when nothing is there. */
export async function loadExploreEntryStats(params: {
  path: string;
}): Promise<Result<EntryStats | null, ExploreFileUnreadable>> {
  const stats = await loadEntryStats({ path: params.path });

  if (stats.kind === 'succeeded') {
    return stats;
  }

  return toNullWhenNotFound({ path: params.path, failure: stats.failure });
}

/** The path with every link resolved; `null` when nothing is there or a part of it is no folder. */
export async function loadExploreRealPath(params: {
  path: string;
}): Promise<Result<string | null, ExploreFileUnreadable>> {
  try {
    const realPath = await runFilesystemCall(() => realpath(params.path));

    return { kind: 'succeeded', value: realPath };
  } catch (error) {
    return toNullWhenNotFound({
      path: params.path,
      failure: getFileFailure({ code: getErrorCode(error) }),
    });
  }
}

function toNullWhenNotFound(params: {
  path: string;
  failure: FileFailure | DirectoryFailure;
}): Result<null, ExploreFileUnreadable> {
  const verdict = decideExploreReadFailure(params);

  if (verdict.kind === 'failed') {
    return verdict;
  }

  return { kind: 'succeeded', value: null };
}

/** Absent and unfit are verdicts of the state; any other failure leaves as `fileUnreadable`. */
function decideExploreReadFailure(params: {
  path: string;
  failure: FileFailure | DirectoryFailure | FileContentFailure;
}): Result<ReadFailureVerdictAbsent | ReadFailureVerdictUnfit, ExploreFileUnreadable> {
  const verdict = decideReadFailure(params.failure);

  if (verdict.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'fileUnreadable', path: params.path, failure: verdict.failure },
    };
  }

  return { kind: 'succeeded', value: verdict };
}
