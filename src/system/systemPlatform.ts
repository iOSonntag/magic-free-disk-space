import type { Result } from '../result.js';
import type { EntryReads } from './entryReads.js';
import type { FullDiskAccess } from './fullDiskAccess.js';
import type { CommandFailure } from './loadCommandOutput.js';
import type { SystemCallFailure } from './systemCallFailure.js';
import type { VolumeSpace } from './volumeSpace.js';

/** A call of the operating system that listed the processes failed, with its error code. */
export type ProcessListingCallFailure = { reason: 'callFailed' } & SystemCallFailure;

/** Why the processes could not be listed: by the command that lists them, or by a system call. */
export type RunningProcessesFailure = CommandFailure | ProcessListingCallFailure;

/** The running processes of macOS, each by its command line. */
export type RunningProcessesCommandLines = { kind: 'commandLines'; commandLines: string[] };

/**
 * The running processes of Windows, each by the full path of its image, since Windows gives no
 * other process's arguments to a reader; a process whose image path cannot be read is its image's
 * file name.
 */
export type RunningProcessesImagePaths = { kind: 'imagePaths'; imagePaths: string[] };

/** The running processes, in the form the platform tells what is in use by. */
export type RunningProcesses = RunningProcessesCommandLines | RunningProcessesImagePaths;

/** Lists the running processes; `commandTimeoutMs` bounds a listing that runs a command. Never throws. */
export type RunningProcessesLoad = (params: {
  commandTimeoutMs: number;
}) => Promise<Result<RunningProcesses, RunningProcessesFailure>>;

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
