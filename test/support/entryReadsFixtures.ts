import { loadPathMeasurement } from '../../src/scan/loadPathMeasurement.js';
import type { EntryReads } from '../../src/system/entryReads.js';
import { loadEntryStats } from '../../src/system/loadEntryStats.js';
import { hostPlatform } from './platformFixtures.js';

/**
 * Entry reads that answer from the test: `privateBytes` for every file, `null` a failed read. An
 * entry of `cloudOnlyPaths` is cloud-only, of `linkPaths` a link, of `unreadCodes` unplaceable
 * with its code; any other is placed as lstat names it, as on macOS.
 */
export function buildTestEntryReads(params: {
  privateBytes: number | null;
  cloudOnlyPaths?: string[];
  linkPaths?: string[];
  unreadCodes?: Map<string, string>;
}): EntryReads {
  const cloudOnlyPaths = params.cloudOnlyPaths ?? [];
  const linkPaths = params.linkPaths ?? [];
  const unreadCodes = params.unreadCodes ?? new Map<string, string>();

  return {
    loadEntryPlacement: (entry) => {
      const unreadCode = unreadCodes.get(entry.path);

      if (unreadCode !== undefined) {
        return { kind: 'unread', code: unreadCode };
      }

      if (cloudOnlyPaths.includes(entry.path)) {
        return { kind: 'cloudOnly' };
      }

      if (linkPaths.includes(entry.path) || entry.kind === 'symbolicLink') {
        return { kind: 'link' };
      }

      return { kind: 'onDisk' };
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
    entryReads: hostPlatform.system.entryReads,
    recordEvictedEntry: null,
  });

  return measurement.allocatedBytes;
}
