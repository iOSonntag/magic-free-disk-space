import type { EntryStats } from '../../system/loadEntryStats.js';
import type { FileIdentity } from '../../system/loadFileIdentity.js';

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

/**
 * A file the cloud also holds that is downloaded and that nobody changed or read since
 * `cutoffMs`. A file whose content only the cloud holds has no blocks on this disk.
 */
export function isEvictableFile(params: { times: EntryStats; cutoffMs: number }): boolean {
  return (
    params.times.kind === 'file' &&
    params.times.allocatedBytes > 0 &&
    Math.max(params.times.modifiedMs, params.times.accessedMs) < params.cutoffMs
  );
}

/**
 * Whether the file the scan found to evict is still that file, still downloaded, and untouched:
 * the same inode born at the same time, with the times the scan read.
 */
export function isEvictFileUnchanged(params: {
  times: EntryStats;
  identity: FileIdentity;
  modifiedMs: number;
  accessedMs: number;
}): boolean {
  return (
    params.times.kind === 'file' &&
    params.times.dev === params.identity.dev &&
    params.times.ino === params.identity.ino &&
    params.times.bornMs === Number(params.identity.birthtimeNs / NANOSECONDS_PER_MILLISECOND) &&
    params.times.allocatedBytes > 0 &&
    params.times.modifiedMs === params.modifiedMs &&
    params.times.accessedMs === params.accessedMs
  );
}
