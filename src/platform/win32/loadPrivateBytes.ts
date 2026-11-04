import { lstatSync } from 'node:fs';

/**
 * The bytes the entry at `path` allocates, all of which deleting it frees on NTFS, where no file
 * shares its clusters with another; `null` when its stats cannot be read. Never throws.
 */
export function loadPrivateBytes(path: string): number | null {
  try {
    return Number(lstatSync(path, { bigint: true }).blocks * 512n);
  } catch {
    return null;
  }
}
