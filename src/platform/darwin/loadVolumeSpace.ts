import { statfs } from 'node:fs/promises';
import type { VolumeSpace } from '../../system/volumeSpace.js';

/**
 * The capacity and the available space of the volume that holds `path`, by `statfs`: its blocks
 * and its blocks available to the user, each times the block size. `null` when the volume cannot
 * be read. Never throws.
 */
export async function loadVolumeSpace(path: string): Promise<VolumeSpace | null> {
  try {
    const volume = await statfs(path, { bigint: true });

    return {
      capacityBytes: Number(volume.blocks * volume.bsize),
      availableBytes: Number(volume.bavail * volume.bsize),
    };
  } catch {
    return null;
  }
}
