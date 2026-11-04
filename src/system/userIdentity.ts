import type { Result } from '../result.js';

declare const posixUidBrand: unique symbol;

/** A user id of a POSIX system that `parsePosixUid` checked: a non-negative integer. */
export type PosixUid = number & { [posixUidBrand]: true };

export type UserIdentityPosix = { kind: 'posix'; uid: PosixUid };

/** The account the run deletes as, one member per form in which an operating system names it. */
export type UserIdentity = UserIdentityPosix;

/** The one maker of a `PosixUid`; fails for a value that is no non-negative integer. */
export function parsePosixUid(params: { value: number }): Result<PosixUid, string> {
  if (!Number.isInteger(params.value) || params.value < 0) {
    return { kind: 'failed', failure: 'not a non-negative integer' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.value as PosixUid };
}
