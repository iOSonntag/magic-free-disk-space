import type { FileKind } from './loadFileIdentity.js';

/** An entry by its path and the kind lstat gives it. */
export type EntryRef = { path: string; kind: FileKind };

/** The entry's content lies on this computer, to read as its kind says. */
type EntryPlacementOnDisk = { kind: 'onDisk' };

/** The entry's content is kept only in a cloud store, so reading it would download it. */
type EntryPlacementCloudOnly = { kind: 'cloudOnly' };

/**
 * The entry is a link of any kind, never entered or followed, which on Windows is every reparse
 * point, whatever lstat calls it.
 */
type EntryPlacementLink = { kind: 'link' };

/**
 * The read failed, so where the content lies is not known: a scan reads the entry as on disk, a
 * deletion refuses it. `code` is the error code as a removal reads it: a POSIX name where the
 * system has one, else the failed call with its code.
 */
type EntryPlacementUnread = { kind: 'unread'; code: string };

/** Where an entry's content lies, beyond what lstat tells. */
export type EntryPlacement =
  | EntryPlacementOnDisk
  | EntryPlacementCloudOnly
  | EntryPlacementLink
  | EntryPlacementUnread;

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

/**
 * The kind an entry of `kind` has in `placement`: a link, whatever lstat says, when it is one, and
 * the kind lstat says for an entry that could not be placed, as for one on disk.
 */
export function getPlacedFileKind(params: { kind: FileKind; placement: EntryPlacement }): FileKind {
  switch (params.placement.kind) {
    case 'onDisk':
    case 'cloudOnly':
    case 'unread':
      return params.kind;
    case 'link':
      return 'symbolicLink';
  }
}
