import type { EntryReads } from '../../system/entryReads.js';
import { loadEntryPlacement } from './loadEntryPlacement.js';
import { loadPrivateBytes } from './loadPrivateBytes.js';

/**
 * How Windows places an entry and reads its private bytes, for the scan, the walk and the removal.
 */
export const win32EntryReads: EntryReads = {
  loadEntryPlacement: loadEntryPlacement,
  loadPrivateBytes: loadPrivateBytes,
};
