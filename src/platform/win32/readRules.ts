import type { FullDiskAccess } from '../../system/fullDiskAccess.js';

/**
 * Windows has no privacy protection that refuses a read with a code of its own: `EPERM` and
 * `EACCES` are both denials by the access list of the file.
 */
export const WIN32_PRIVACY_DENIAL_CODE: string | null = null;

/** Windows has no Full Disk Access, so whether this process has it stays unknown. Never throws. */
export async function loadFullDiskAccess(): Promise<FullDiskAccess> {
  return 'unknown';
}
