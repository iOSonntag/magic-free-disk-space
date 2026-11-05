import type { FileKind } from './loadFileIdentity.js';

/** An entry whose content the system may keep elsewhere, by its kind. */
export type EvictionCandidate = { path: string; kind: FileKind };

/**
 * True when the entry's content lives only in a cloud store, so reading it would download it.
 * Never throws.
 */
export type EntryEvictionCheck = (entry: EvictionCandidate) => boolean;

/** The reads of one entry beyond its stats that the platform answers, for walks and measurements. */
export type EntryReads = {
  /** Asked before an entry is read, so a walk never downloads an evicted one. */
  isEntryEvicted: EntryEvictionCheck;
  /**
   * The bytes of one file that no APFS clone shares, which deleting it frees; `null` when they
   * cannot be read. Never throws.
   */
  loadPrivateBytes: (path: string) => number | null;
};
