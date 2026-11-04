import type { UserIdentity } from '../system/userIdentity.js';

const ROOT_USER_ID = 0;

const ANY_EXECUTE_BITS = 0o111;

const GROUP_AND_OTHERS_WRITE_BITS = 0o022;

/** The facts of a binary's real path that its trust rests on. */
export type ToolFileStats = { isRegularFile: boolean; mode: number; ownerUserId: number };

/** Why a binary is not trusted. */
export type ToolDistrustDetail = 'foreignOwner' | 'writableByOthers' | 'notExecutableFile';

export type ToolTrust = { isTrusted: true } | { isTrusted: false; detail: ToolDistrustDetail };

/**
 * Trusts a regular executable file owned by `user` or root that neither its group nor others
 * can write.
 */
export function decideToolTrust(params: { stats: ToolFileStats; user: UserIdentity }): ToolTrust {
  if (!params.stats.isRegularFile || (params.stats.mode & ANY_EXECUTE_BITS) === 0) {
    return { isTrusted: false, detail: 'notExecutableFile' };
  }

  if (!isOwnedByUserOrRoot({ ownerUserId: params.stats.ownerUserId, user: params.user })) {
    return { isTrusted: false, detail: 'foreignOwner' };
  }

  if ((params.stats.mode & GROUP_AND_OTHERS_WRITE_BITS) !== 0) {
    return { isTrusted: false, detail: 'writableByOthers' };
  }

  return { isTrusted: true };
}

function isOwnedByUserOrRoot(params: { ownerUserId: number; user: UserIdentity }): boolean {
  switch (params.user.kind) {
    case 'posix':
      return params.ownerUserId === params.user.uid || params.ownerUserId === ROOT_USER_ID;
  }
}
