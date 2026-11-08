import { loadPathMeasurement } from '../../src/scan/loadPathMeasurement.js';
import type { EntryReads } from '../../src/system/entryReads.js';
import { loadEntryStats } from '../../src/system/loadEntryStats.js';
import { HOST_PLATFORM } from './platformFixtures.js';

/**
 * Entry reads that answer from the test: `privateBytes` as the private size of every file, `null`
 * being a failed read. An entry at one of `cloudOnlyPaths` is kept in the cloud only, one at one
 * of `linkPaths` is a link whatever lstat says, and any other is placed as lstat names it, as on
 * macOS.
 */
export function buildTestEntryReads(params: {
  privateBytes: number | null;
  cloudOnlyPaths?: string[];
  linkPaths?: string[];
}): EntryReads {
  const cloudOnlyPaths = params.cloudOnlyPaths ?? [];
  const linkPaths = params.linkPaths ?? [];

  return {
    loadEntryPlacement: (entry) => {
      if (cloudOnlyPaths.includes(entry.path)) {
        return 'cloudOnly';
      }

      if (linkPaths.includes(entry.path) || entry.kind === 'symbolicLink') {
        return 'link';
      }

      return 'onDisk';
    },
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
    recordEvictedEntry: null,
  });

  return measurement.allocatedBytes;
}
