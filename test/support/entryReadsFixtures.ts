import { loadPathMeasurement } from '../../src/scan/loadPathMeasurement.js';
import type { EntryEvictionCheck, EntryReads } from '../../src/system/entryReads.js';
import { loadEntryStats } from '../../src/system/loadEntryStats.js';
import { HOST_PLATFORM } from './platformFixtures.js';

/**
 * Entry reads that answer from the test: `privateBytes` as the private size of every file, `null`
 * being a failed read, and no entry evicted unless `isEntryEvicted` says so.
 */
export function buildTestEntryReads(params: {
  privateBytes: number | null;
  isEntryEvicted?: EntryEvictionCheck;
}): EntryReads {
  return {
    isEntryEvicted: params.isEntryEvicted ?? (() => false),
    loadPrivateBytes: () => params.privateBytes,
  };
}

/** The allocated blocks of the one entry at `path` by its stats, a folder's entries left out. */
export async function loadEntryAllocatedBytes(params: { path: string }): Promise<number> {
  const stats = await loadEntryStats({ path: params.path });

  if (stats.kind === 'failed') {
    throw new Error(`Stats failed: ${stats.failure.reason}`);
  }

  return stats.value.allocatedBytes;
}

/**
 * What the scan measures at `paths` as one tally, each entry inside them counted, by the host
 * platform's entry reads.
 */
export async function loadMeasuredAllocatedBytes(params: { paths: string[] }): Promise<number> {
  const measurement = await loadPathMeasurement({
    paths: params.paths,
    deadlineMs: Date.now() + 60_000,
    entryReads: HOST_PLATFORM.system.entryReads,
  });

  return measurement.allocatedBytes;
}
