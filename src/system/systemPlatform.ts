import type { FullDiskAccess } from './fullDiskAccess.js';
import type { FileKind } from './loadFileIdentity.js';

/** An entry whose content the system may keep elsewhere, by its kind. */
export type EvictionCandidate = { path: string; kind: FileKind };

/** What the system mechanisms take from the operating system. */
export type SystemPlatform = {
  /**
   * True when the entry's content lives only in a cloud store, so reading it would download it.
   * Never throws.
   */
  isEntryEvicted: (entry: EvictionCandidate) => boolean;
  /** The error code with which privacy protection refuses a read; `null` on a platform without it. */
  privacyDenialCode: string | null;
  /** Never throws. */
  loadFullDiskAccess: (params: { homeDir: string }) => Promise<FullDiskAccess>;
};
