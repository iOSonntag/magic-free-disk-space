import type { EntryStats } from '../../system/loadEntryStats.js';

/**
 * An attachment copy nobody changed since Mail saved it, and that was neither saved nor read since
 * `cutoffMs`. Mail may keep the time of the attachment, which is earlier than the save.
 */
export function isUntouchedMailDownload(params: { stats: EntryStats; cutoffMs: number }): boolean {
  return (
    params.stats.kind === 'file' &&
    params.stats.modifiedMs <= params.stats.bornMs &&
    Math.max(params.stats.bornMs, params.stats.accessedMs) < params.cutoffMs
  );
}
