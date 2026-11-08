import type { Result } from '../result.js';

declare const posixUidBrand: unique symbol;

declare const windowsSidBrand: unique symbol;

/** A user id of a POSIX system that `parsePosixUid` checked: a non-negative integer. */
export type PosixUid = number & { [posixUidBrand]: true };

/**
 * A security identifier of Windows in its string form, such as `S-1-5-21-…-1001`, that
 * `parseWindowsSid` checked. Windows writes this form in one spelling per SID, so two equal SIDs
 * compare equal as text.
 */
export type WindowsSid = string & { [windowsSidBrand]: true };

export type UserIdentityPosix = { kind: 'posix'; uid: PosixUid };

export type UserIdentityWindows = { kind: 'windows'; sid: WindowsSid };

/** The account the run deletes as, one member per form in which an operating system names it. */
export type UserIdentity = UserIdentityPosix | UserIdentityWindows;

/** `S-1-`, an identifier authority in decimal or hex, and up to 15 decimal sub-authorities. */
const windowsSidPattern = /^S-1-(?:\d+|0x[0-9A-F]{12})(?:-\d+){0,15}$/;

/** The one maker of a `PosixUid`; fails for a value that is no non-negative integer. */
export function parsePosixUid(params: { value: number }): Result<PosixUid, string> {
  if (!Number.isInteger(params.value) || params.value < 0) {
    return { kind: 'failed', failure: 'not a non-negative integer' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.value as PosixUid };
}

/** The one maker of a `WindowsSid`; fails for a text that is no SID in its string form. */
export function parseWindowsSid(params: {
  text: string;
}): Result<WindowsSid, 'not a security identifier'> {
  if (!windowsSidPattern.test(params.text)) {
    return { kind: 'failed', failure: 'not a security identifier' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as WindowsSid };
}
