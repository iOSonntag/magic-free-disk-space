import type { EntryStats } from '../../system/loadEntryStats.js';
import type { FileIdentity } from '../../system/loadFileIdentity.js';

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

/**
 * A file the cloud also holds that is downloaded and that nobody changed or read since
 * `cutoffMs`. A file whose content only the cloud holds has no blocks on this disk.
 */
export function isEvictableFile(params: { stats: EntryStats; cutoffMs: number }): boolean {
  return (
    params.stats.kind === 'file' &&
    params.stats.allocatedBytes > 0 &&
    Math.max(params.stats.modifiedMs, params.stats.accessedMs) < params.cutoffMs
  );
}

/**
 * Whether the file the scan found to evict is still that file, still downloaded, and untouched:
 * the same inode born at the same time, with the times the scan read.
 */
export function isEvictFileUnchanged(params: {
  stats: EntryStats;
  identity: FileIdentity;
  modifiedMs: number;
  accessedMs: number;
}): boolean {
  return (
    params.stats.kind === 'file' &&
    params.stats.dev === params.identity.dev &&
    params.stats.ino === params.identity.ino &&
    params.stats.bornMs === Number(params.identity.birthtimeNs / NANOSECONDS_PER_MILLISECOND) &&
    params.stats.allocatedBytes > 0 &&
    params.stats.modifiedMs === params.modifiedMs &&
    params.stats.accessedMs === params.accessedMs
  );
}
