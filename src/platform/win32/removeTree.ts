import type { TreeRemoval } from '../../delete/deletePlatform.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import { WIN32_PATH_RULES } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { EntryReads } from '../../system/entryReads.js';
import { formatEntryCallFailure } from './formatEntryCallFailure.js';
import { loadEntryPlacement } from './loadEntryPlacement.js';
import { loadPrivateBytes } from './loadPrivateBytes.js';
import type { EntryAttributeAccess } from './removeTreeEntries.js';
import { removeTreeEntries } from './removeTreeEntries.js';
import type { Win32CallFailure } from './win32Api.js';
import { loadFileAttributes, setFileAttributes } from './win32Api.js';

const win32EntryAttributes: EntryAttributeAccess = {
  load: loadEntryAttributes,
  save: saveEntryAttributes,
};

/** How Windows places an entry and reads its private bytes, for the scan and for the removal. */
export const win32EntryReads: EntryReads = {
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
    attributes: win32EntryAttributes,
    entryReads: win32EntryReads,
  });
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
