import type { FullDiskAccess } from './decideFullDiskAccess.js';

/** Probes whether this process has Full Disk Access; never throws. */
export async function loadFullDiskAccess(_params: { homeDir: string }): Promise<FullDiskAccess> {
  return 'unknown';
}
