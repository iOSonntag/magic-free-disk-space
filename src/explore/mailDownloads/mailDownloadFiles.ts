import type { EntryTimes } from '../../system/loadEntryTimes.js';

/**
 * An attachment copy nobody changed since Mail saved it, and that was neither saved nor read since
 * `cutoffMs`. Mail may keep the time of the attachment, which is earlier than the save.
 */
export function isUntouchedMailDownload(params: { times: EntryTimes; cutoffMs: number }): boolean {
  return (
    params.times.kind === 'file' &&
    params.times.modifiedMs <= params.times.bornMs &&
    Math.max(params.times.bornMs, params.times.accessedMs) < params.cutoffMs
  );
}
