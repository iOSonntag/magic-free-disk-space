const ROOT_USER_ID = 0;

const ANY_EXECUTE_BITS = 0o111;

const GROUP_AND_OTHERS_WRITE_BITS = 0o022;

/** The facts of a binary's real path that its trust rests on. */
export type ToolFileStats = { isRegularFile: boolean; mode: number; ownerUserId: number };

/** Why a binary is not trusted. */
export type ToolDistrustDetail = 'foreignOwner' | 'writableByOthers' | 'notExecutableFile';

export type ToolTrust = { isTrusted: true } | { isTrusted: false; detail: ToolDistrustDetail };

/**
 * Trusts a regular executable file owned by `userId` or root that neither its group nor others
 * can write.
 */
export function decideToolTrust(params: { stats: ToolFileStats; userId: number }): ToolTrust {
  if (!params.stats.isRegularFile || (params.stats.mode & ANY_EXECUTE_BITS) === 0) {
    return { isTrusted: false, detail: 'notExecutableFile' };
  }

  if (params.stats.ownerUserId !== params.userId && params.stats.ownerUserId !== ROOT_USER_ID) {
    return { isTrusted: false, detail: 'foreignOwner' };
  }

  if ((params.stats.mode & GROUP_AND_OTHERS_WRITE_BITS) !== 0) {
    return { isTrusted: false, detail: 'writableByOthers' };
  }

  return { isTrusted: true };
}
