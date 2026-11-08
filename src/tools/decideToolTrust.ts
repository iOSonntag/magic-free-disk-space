import type { PosixUid, UserIdentity } from '../system/userIdentity.js';

const ROOT_USER_ID = 0;

const ANY_EXECUTE_BITS = 0o111;

const GROUP_AND_OTHERS_WRITE_BITS = 0o022;

/** The facts of a binary's real path that its trust rests on. */
export type ToolFileStats = { isRegularFile: boolean; mode: number; ownerUserId: number };

/**
 * Why a binary is not trusted. `ownerUnchecked` is every binary on Windows, whose file owner and
 * rights the tool does not read.
 */
export type ToolDistrustDetail =
  | 'foreignOwner'
  | 'writableByOthers'
  | 'notExecutableFile'
  | 'ownerUnchecked';

export type ToolTrust = { isTrusted: true } | { isTrusted: false; detail: ToolDistrustDetail };

/**
 * Trusts a regular executable file owned by `user` or root that neither its group nor others
 * can write. Trusts no binary of a Windows user.
 */
export function decideToolTrust(params: { stats: ToolFileStats; user: UserIdentity }): ToolTrust {
  switch (params.user.kind) {
    case 'posix':
      return decidePosixToolTrust({ stats: params.stats, uid: params.user.uid });
    case 'windows':
      return { isTrusted: false, detail: 'ownerUnchecked' };
  }
}

function decidePosixToolTrust(params: { stats: ToolFileStats; uid: PosixUid }): ToolTrust {
  if (!params.stats.isRegularFile || (params.stats.mode & ANY_EXECUTE_BITS) === 0) {
    return { isTrusted: false, detail: 'notExecutableFile' };
  }

  if (params.stats.ownerUserId !== params.uid && params.stats.ownerUserId !== ROOT_USER_ID) {
    return { isTrusted: false, detail: 'foreignOwner' };
  }

  if ((params.stats.mode & GROUP_AND_OTHERS_WRITE_BITS) !== 0) {
    return { isTrusted: false, detail: 'writableByOthers' };
  }

  return { isTrusted: true };
}
