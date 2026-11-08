import { lstatSync } from 'node:fs';

/**
 * The bytes the entry at `path` allocates by its stats: the most deleting it frees, since a block
 * clone on ReFS shares some of them, and the scan counts a hard-linked file once. `null` when its
 * stats cannot be read. Never throws.
 */
export function loadPrivateBytes(path: string): number | null {
  try {
    return Number(lstatSync(path, { bigint: true }).blocks * 512n);
  } catch {
    return null;
  }
}
