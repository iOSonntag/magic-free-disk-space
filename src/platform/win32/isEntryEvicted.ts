import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { EvictionCandidate } from '../../system/entryReads.js';
import { WIN32_PATH_RULES } from './loadEnvironment.js';
import { loadFileAttributes } from './win32Api.js';

/** Reading the content of an entry with this attribute downloads it, as OneDrive's online-only files. */
const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x400000;

/** Opening an entry with this attribute downloads it, as a folder OneDrive has not listed yet. */
const FILE_ATTRIBUTE_RECALL_ON_OPEN = 0x40000;

/**
 * True for an entry of any kind whose content a cloud store keeps off this PC, by its recall
 * attributes. `false` when its attributes cannot be read, so a walk then reads it as any other.
 */
export function isEntryEvicted(params: EvictionCandidate): boolean {
  const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: params.path });

  if (path.kind === 'failed') {
    return false;
  }

  const attributes = loadFileAttributes({ path: path.value });

  if (attributes.kind === 'failed') {
    return false;
  }

  return hasRecallAttribute({ attributes: attributes.value });
}

/** Whether the attributes hold a bit that makes a read or an open download the entry. */
export function hasRecallAttribute(params: { attributes: number }): boolean {
  return (
    (params.attributes & (FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS | FILE_ATTRIBUTE_RECALL_ON_OPEN)) !==
    0
  );
}
