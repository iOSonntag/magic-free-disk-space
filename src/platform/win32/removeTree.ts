import type { TreeRemoval } from '../../delete/deletePlatform.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { EntryReads } from '../../system/entryReads.js';
import { formatSystemCallFailure } from '../../system/systemCallFailure.js';
import { loadEntryPlacement } from './loadEntryPlacement.js';
import { WIN32_PATH_RULES } from './loadEnvironment.js';
import { loadPrivateBytes } from './loadPrivateBytes.js';
import type { EntryAttributeAccess } from './removeTreeEntries.js';
import { removeTreeEntries } from './removeTreeEntries.js';
import type { Win32CallFailure } from './win32Api.js';
import { loadFileAttributes, setFileAttributes } from './win32Api.js';

/**
 * The `GetLastError` codes that Bun's file calls report by a POSIX name, so the deletion reads a
 * failed attribute call as it reads a failed removal: not found, access denied, a sharing
 * violation, and a lock violation.
 */
const ERROR_CODE_NAMES = new Map<number, string>([
  [2, 'ENOENT'],
  [3, 'ENOENT'],
  [5, 'EPERM'],
  [32, 'EBUSY'],
  [33, 'EBUSY'],
]);

const WIN32_ENTRY_ATTRIBUTES: EntryAttributeAccess = {
  load: loadEntryAttributes,
  save: saveEntryAttributes,
};

const WIN32_ENTRY_READS: EntryReads = {
  loadEntryPlacement: loadEntryPlacement,
  loadPrivateBytes: loadPrivateBytes,
};

/**
 * Removes the tree at `path` entry by entry, never entering a link or a junction, clearing the
 * read-only bit of each file and folder, and leaving a file another program holds open or Windows
 * refuses to delete and an entry kept only online, so the removal can end partly done. Fails with
 * `EINVAL` for a path that is no absolute Windows path. Never throws.
 */
export async function removeTree(params: { path: string }): Promise<Result<TreeRemoval, string>> {
  const rootPath = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: params.path });

  if (rootPath.kind === 'failed') {
    return { kind: 'failed', failure: 'EINVAL' };
  }

  return removeTreeEntries({
    rootPath: rootPath.value,
    rules: WIN32_PATH_RULES,
    attributes: WIN32_ENTRY_ATTRIBUTES,
    entryReads: WIN32_ENTRY_READS,
  });
}

/**
 * The failed call as the code the deletion reads: a POSIX name where Bun has one, else the call
 * with its code, as every failed call of the system reads.
 */
export function formatEntryCallFailure(params: { failure: Win32CallFailure }): string {
  return (
    ERROR_CODE_NAMES.get(params.failure.code) ??
    formatSystemCallFailure({ failure: params.failure })
  );
}

function loadEntryAttributes(params: { path: AbsolutePath }): Result<number, string> {
  return toEntryCallResult(loadFileAttributes({ path: params.path }));
}

function saveEntryAttributes(params: {
  path: AbsolutePath;
  attributes: number;
}): Result<null, string> {
  return toEntryCallResult(setFileAttributes({ path: params.path, attributes: params.attributes }));
}

function toEntryCallResult<TValue>(
  result: Result<TValue, Win32CallFailure>,
): Result<TValue, string> {
  if (result.kind === 'failed') {
    return { kind: 'failed', failure: formatEntryCallFailure({ failure: result.failure }) };
  }

  return result;
}
