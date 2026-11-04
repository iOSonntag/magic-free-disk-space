import type { Result } from '../result.js';
import type { FullDiskAccess } from './fullDiskAccess.js';
import type { CommandFailure } from './loadCommandOutput.js';
import type { FileKind } from './loadFileIdentity.js';

/** An entry whose content the system may keep elsewhere, by its kind. */
export type EvictionCandidate = { path: string; kind: FileKind };

/**
 * True when the entry's content lives only in a cloud store, so reading it would download it.
 * Never throws.
 */
export type EntryEvictionCheck = (entry: EvictionCandidate) => boolean;

/** The command line of each running process, which tells what is in use. Never throws. */
export type RunningProcessesLoad = (params: {
  commandTimeoutMs: number;
}) => Promise<Result<string[], CommandFailure>>;

/** What the system mechanisms take from the operating system. */
export type SystemPlatform = {
  isEntryEvicted: EntryEvictionCheck;
  /** The error code with which privacy protection refuses a read; `null` on a platform without it. */
  privacyDenialCode: string | null;
  /** Never throws. */
  loadFullDiskAccess: (params: { homeDir: string }) => Promise<FullDiskAccess>;
  loadRunningProcesses: RunningProcessesLoad;
};
