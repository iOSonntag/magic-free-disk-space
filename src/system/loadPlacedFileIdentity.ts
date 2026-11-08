import type { Result } from '../result.js';
import type { EntryReads } from './entryReads.js';
import { getPlacedFileKind } from './entryReads.js';
import type { FileFailure, FileIdentity } from './loadFileIdentity.js';
import { loadFileIdentityOfKind } from './loadFileIdentity.js';

/**
 * The identity of the root of an item, kind and real path as the walks meet the entry: a link of
 * any kind, which `entryReads` may name where lstat does not, is a `symbolicLink`, and an entry
 * the reads cannot place keeps the kind lstat names, as a walk reads it on disk.
 */
export function loadPlacedFileIdentity(params: {
  path: string;
  entryReads: EntryReads;
}): Promise<Result<FileIdentity, FileFailure>> {
  return loadFileIdentityOfKind({
    path: params.path,
    decideKind: (lstatKind) =>
      getPlacedFileKind({
        kind: lstatKind,
        placement: params.entryReads.loadEntryPlacement({ path: params.path, kind: lstatKind }),
      }),
  });
}
