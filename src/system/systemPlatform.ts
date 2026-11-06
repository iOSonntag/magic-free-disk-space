import type { Result } from '../result.js';
import type { EntryReads } from './entryReads.js';
import type { FullDiskAccess } from './fullDiskAccess.js';
import type { CommandFailure } from './loadCommandOutput.js';
import type { VolumeSpace } from './volumeSpace.js';

/** The command line of each running process, which tells what is in use. Never throws. */
export type RunningProcessesLoad = (params: {
  commandTimeoutMs: number;
}) => Promise<Result<string[], CommandFailure>>;

/** What the system mechanisms take from the operating system. */
export type SystemPlatform = {
  entryReads: EntryReads;
  /** The error code with which privacy protection refuses a read; `null` on a platform without it. */
  privacyDenialCode: string | null;
  /** Never throws. */
  loadFullDiskAccess: (params: { homeDir: string }) => Promise<FullDiskAccess>;
  loadRunningProcesses: RunningProcessesLoad;
  /** The space of the volume that holds `path`; `null` when it cannot be read. Never throws. */
  loadVolumeSpace: (path: string) => Promise<VolumeSpace | null>;
  /** The version of the operating system, such as `15.1`; `null` when it cannot be read. Never throws. */
  loadSystemVersion: () => Promise<string | null>;
};
