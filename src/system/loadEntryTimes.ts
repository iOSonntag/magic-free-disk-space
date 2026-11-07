import type { EntryStats, EntryStatsResult } from './loadEntryStats.js';
import { loadEntryStats } from './loadEntryStats.js';

/** The entry with the times that tell whether anybody touched it since it came onto the disk. */
export type EntryTimes = EntryStats;

/** Reads the entry itself, never the target of a symbolic link: the one read of `loadEntryStats`. */
export async function loadEntryTimes(params: { path: string }): Promise<EntryStatsResult> {
  return loadEntryStats({ path: params.path });
}
