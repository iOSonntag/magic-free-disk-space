import { lstat } from 'node:fs/promises';
import type { Result } from '../result.js';
import { getErrorCode } from './getErrorCode.js';
import type { FileFailure, FileKind } from './loadFileIdentity.js';
import { getFileFailure, getFileKind } from './loadFileIdentity.js';
import { runFilesystemCall } from './runFilesystemCall.js';

export type EntryStats = {
  kind: FileKind;
  dev: bigint;
  ino: bigint;
  /**
   * Blocks on disk times 512, which is what a removal can free, unlike the apparent size; 0 for a
   * file whose content only the cloud holds.
   */
  allocatedBytes: number;
  /** How many names the entry's inode has, from `nlink`; a folder's count means something else. */
  linkCount: number;
  modifiedMs: number;
  /** The last read of its content, as the volume records it. */
  accessedMs: number;
  /** When the entry was created on this volume. */
  bornMs: number;
};

export type EntryStatsResult = Result<EntryStats, FileFailure>;

/** Reads the entry itself, never the target of a symbolic link. */
export async function loadEntryStats(params: { path: string }): Promise<EntryStatsResult> {
  try {
    const stats = await runFilesystemCall(() => lstat(params.path, { bigint: true }));

    return {
      kind: 'succeeded',
      value: {
        kind: getFileKind({ stats: stats }),
        dev: stats.dev,
        ino: stats.ino,
        allocatedBytes: Number(stats.blocks * 512n),
        linkCount: Number(stats.nlink),
        modifiedMs: Number(stats.mtimeMs),
        accessedMs: Number(stats.atimeMs),
        bornMs: Number(stats.birthtimeMs),
      },
    };
  } catch (error) {
    return { kind: 'failed', failure: getFileFailure({ code: getErrorCode(error) }) };
  }
}
