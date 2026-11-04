import type { TreeRemoval } from '../../delete/deletePlatform.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { EntryReads } from '../../system/entryReads.js';
import { isEntryEvicted } from './isEntryEvicted.js';
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
  isEntryEvicted: isEntryEvicted,
  loadPrivateBytes: loadPrivateBytes,
};

/**
 * Removes the tree at `path` entry by entry, never entering a link or a junction, clearing the
 * read-only bit of each file and folder, and leaving a file another program holds open and an
 * entry kept only online, so the removal can end partly done. Never throws.
 */
export function removeTree(params: { path: string }): Promise<Result<TreeRemoval, string>> {
  return removeTreeEntries({
    path: params.path,
    attributes: WIN32_ENTRY_ATTRIBUTES,
    entryReads: WIN32_ENTRY_READS,
  });
}

/** The failed call as the code the deletion reads: a POSIX name where Bun has one, else its own. */
export function formatEntryCallFailure(params: { failure: Win32CallFailure }): string {
  return (
    ERROR_CODE_NAMES.get(params.failure.code) ?? `${params.failure.call} ${params.failure.code}`
  );
}

function loadEntryAttributes(params: { path: string }): Result<number, string> {
  const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: params.path });

  if (path.kind === 'failed') {
    return { kind: 'failed', failure: 'EINVAL' };
  }

  const attributes = loadFileAttributes({ path: path.value });

  if (attributes.kind === 'failed') {
    return { kind: 'failed', failure: formatEntryCallFailure({ failure: attributes.failure }) };
  }

  return attributes;
}

function saveEntryAttributes(params: { path: string; attributes: number }): Result<null, string> {
  const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: params.path });

  if (path.kind === 'failed') {
    return { kind: 'failed', failure: 'EINVAL' };
  }

  const saved = setFileAttributes({ path: path.value, attributes: params.attributes });

  if (saved.kind === 'failed') {
    return { kind: 'failed', failure: formatEntryCallFailure({ failure: saved.failure }) };
  }

  return saved;
}
