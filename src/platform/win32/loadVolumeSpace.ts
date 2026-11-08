import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import { WIN32_PATH_RULES } from '../../path/pathRules.js';
import type { VolumeSpace } from '../../system/volumeSpace.js';
import { loadDiskFreeSpace } from './win32Api.js';

/**
 * The capacity and the available space of the volume that holds the folder at `path`, as far as
 * the disk quota lets the user use them. `null` when the volume cannot be read. Never throws.
 */
export async function loadVolumeSpace(path: string): Promise<VolumeSpace | null> {
  const folderPath = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: path });

  if (folderPath.kind === 'failed') {
    return null;
  }

  const space = loadDiskFreeSpace({ folderPath: folderPath.value });

  if (space.kind === 'failed') {
    return null;
  }

  return space.value;
}
