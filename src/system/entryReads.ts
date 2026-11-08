import type { FileKind } from './loadFileIdentity.js';

/** An entry by its path and the kind lstat gives it. */
export type EntryRef = { path: string; kind: FileKind };

/**
 * Where an entry's content lies, beyond what lstat tells: `onDisk`, to read as its kind says;
 * `cloudOnly`, kept only in a cloud store, so reading it would download it; or `link`, a link of
 * any kind, never entered or followed, which on Windows is every reparse point, whatever lstat
 * calls it.
 */
export type EntryPlacement = 'onDisk' | 'cloudOnly' | 'link';

/** Places one entry with one read of the system. Never throws. */
export type EntryPlacementLoad = (entry: EntryRef) => EntryPlacement;

/** The reads of one entry beyond its stats that the platform answers, for walks and measurements. */
export type EntryReads = {
  /** Asked before an entry is read, so a walk never downloads an entry or enters a link. */
  loadEntryPlacement: EntryPlacementLoad;
  /**
   * The bytes of one file that no APFS clone shares, which deleting it frees; `null` when they
   * cannot be read. Never throws.
   */
  loadPrivateBytes: (path: string) => number | null;
};

/** The kind an entry of `kind` has in `placement`: a link, whatever lstat says, when it is one. */
export function getPlacedFileKind(params: { kind: FileKind; placement: EntryPlacement }): FileKind {
  switch (params.placement) {
    case 'onDisk':
    case 'cloudOnly':
      return params.kind;
    case 'link':
      return 'symbolicLink';
  }
}
