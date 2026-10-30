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
  /** Blocks on disk times 512, which is what a removal can free, unlike the apparent size. */
  allocatedBytes: number;
  modifiedMs: number;
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
        modifiedMs: Number(stats.mtimeMs),
      },
    };
  } catch (error) {
    return { kind: 'failed', failure: getFileFailure({ code: getErrorCode(error) }) };
  }
}
