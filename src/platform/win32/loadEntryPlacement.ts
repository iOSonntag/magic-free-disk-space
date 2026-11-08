import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import { WIN32_PATH_RULES } from '../../path/pathRules.js';
import type { EntryPlacement, EntryRef } from '../../system/entryReads.js';
import { loadFileAttributes } from './win32Api.js';

/** Reading the content of an entry with this attribute downloads it, as OneDrive's online-only files. */
const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x400000;

/** Opening an entry with this attribute downloads it, as a folder OneDrive has not listed yet. */
const FILE_ATTRIBUTE_RECALL_ON_OPEN = 0x40000;

/**
 * The entry is a link, a junction, a mounted folder, or another program's placeholder, whose
 * content is not its own.
 */
const FILE_ATTRIBUTE_REPARSE_POINT = 0x400;

/**
 * The placement of an entry of any kind by its attributes, read without following a link or
 * recalling it. `onDisk` when they cannot be read, so a walk then reads it as any other.
 */
export function loadEntryPlacement(params: EntryRef): EntryPlacement {
  const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: params.path });

  if (path.kind === 'failed') {
    return 'onDisk';
  }

  const attributes = loadFileAttributes({ path: path.value });

  if (attributes.kind === 'failed') {
    return 'onDisk';
  }

  return decideEntryPlacement({ attributes: attributes.value });
}

/**
 * `cloudOnly` for attributes with a bit that makes a read or an open download the entry, `link`
 * for any other reparse point, else `onDisk`. A recall bit wins, so a placeholder that shows its
 * reparse point is never removed as a link, which would delete it from its cloud store.
 */
export function decideEntryPlacement(params: { attributes: number }): EntryPlacement {
  if (
    (params.attributes & (FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS | FILE_ATTRIBUTE_RECALL_ON_OPEN)) !==
    0
  ) {
    return 'cloudOnly';
  }

  if ((params.attributes & FILE_ATTRIBUTE_REPARSE_POINT) !== 0) {
    return 'link';
  }

  return 'onDisk';
}
