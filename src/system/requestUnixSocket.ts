import type { Stats } from 'node:fs';
import { lstat, readlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Result } from '../result.js';
import { getErrorCode } from './getErrorCode.js';
import type { UserIdentity } from './userIdentity.js';

export type UnixSocketMethod = 'GET' | 'POST' | 'DELETE';

/** A success answer of the server behind the socket. */
export type UnixSocketAnswer = { status: number; bodyText: string };

/** Nothing listens: no entry at the path, or a stale socket that refuses the connect. */
export type UnixSocketRequestFailureSocketMissing = { kind: 'socketMissing' };

/** The path is no socket the user owns, so nothing was sent. */
export type UnixSocketRequestFailureSocketUntrusted = {
  kind: 'socketUntrusted';
  detail: 'notSocket' | 'notOwnedByUser';
};

export type UnixSocketRequestFailureRequestFailed = {
  kind: 'requestFailed';
  /** The HTTP status of an answer that was not a success; `null` when none came. */
  status: number | null;
  /** The error code of a request that got no full answer; `null` when one came. */
  code: string | null;
};

export type UnixSocketRequestFailure =
  | UnixSocketRequestFailureSocketMissing
  | UnixSocketRequestFailureSocketUntrusted
  | UnixSocketRequestFailureRequestFailed;

export type UnixSocketRequestResult = Result<UnixSocketAnswer, UnixSocketRequestFailure>;

const MISSING_CODES = ['ENOENT', 'ENOTDIR'];

const REFUSED_CODES = ['ENOENT', 'ECONNREFUSED'];

const TIMED_OUT_CODE = 'ETIMEDOUT';

/**
 * Sends one HTTP request over the unix socket at `socketPath`, only once an `lstat` right before
 * the connect shows a socket the user owns; a link the user owns counts by the socket it names
 * directly, and the connect goes to that socket. Only a 2xx answer succeeds. Never rejects.
 */
export async function requestUnixSocket(params: {
  socketPath: string;
  user: UserIdentity;
  method: UnixSocketMethod;
  /** The path and query of the request, such as `/v1.47/system/df`. */
  requestPath: string;
  timeoutMs: number;
}): Promise<UnixSocketRequestResult> {
  const trusted = await findTrustedSocketPath({ socketPath: params.socketPath, user: params.user });

  if (trusted.kind === 'failed') {
    return trusted;
  }

  return sendUnixSocketRequest({
    connectPath: trusted.value,
    method: params.method,
    requestPath: params.requestPath,
    timeoutMs: params.timeoutMs,
  });
}

async function findTrustedSocketPath(params: {
  socketPath: string;
  user: UserIdentity;
}): Promise<Result<string, UnixSocketRequestFailure>> {
  const entry = await loadSocketEntryStats({ path: params.socketPath });

  if (entry.kind === 'failed') {
    return entry;
  }

  if (!entry.value.isSocket() && !entry.value.isSymbolicLink()) {
    return { kind: 'failed', failure: { kind: 'socketUntrusted', detail: 'notSocket' } };
  }

  if (entry.value.uid !== params.user.uid) {
    return { kind: 'failed', failure: { kind: 'socketUntrusted', detail: 'notOwnedByUser' } };
  }

  if (entry.value.isSocket()) {
    return { kind: 'succeeded', value: params.socketPath };
  }

  const target = await loadLinkTargetPath({ linkPath: params.socketPath });

  if (target.kind === 'failed') {
    return target;
  }

  const targetEntry = await loadSocketEntryStats({ path: target.value });

  if (targetEntry.kind === 'failed') {
    return targetEntry;
  }

  if (!targetEntry.value.isSocket()) {
    return { kind: 'failed', failure: { kind: 'socketUntrusted', detail: 'notSocket' } };
  }

  if (targetEntry.value.uid !== params.user.uid) {
    return { kind: 'failed', failure: { kind: 'socketUntrusted', detail: 'notOwnedByUser' } };
  }

  return { kind: 'succeeded', value: target.value };
}

async function loadSocketEntryStats(params: {
  path: string;
}): Promise<Result<Stats, UnixSocketRequestFailure>> {
  try {
    return { kind: 'succeeded', value: await lstat(params.path) };
  } catch (error) {
    return { kind: 'failed', failure: toEntryFailure({ code: getErrorCode(error) }) };
  }
}

// `realpath` refuses a socket on macOS with EOPNOTSUPP, so the link is read and resolved by hand.
async function loadLinkTargetPath(params: {
  linkPath: string;
}): Promise<Result<string, UnixSocketRequestFailure>> {
  try {
    const target = await readlink(params.linkPath);

    return { kind: 'succeeded', value: resolve(dirname(params.linkPath), target) };
  } catch (error) {
    return { kind: 'failed', failure: toEntryFailure({ code: getErrorCode(error) }) };
  }
}

function toEntryFailure(params: { code: string }): UnixSocketRequestFailure {
  if (MISSING_CODES.includes(params.code)) {
    return { kind: 'socketMissing' };
  }

  return { kind: 'requestFailed', status: null, code: params.code };
}

async function sendUnixSocketRequest(params: {
  connectPath: string;
  method: UnixSocketMethod;
  requestPath: string;
  timeoutMs: number;
}): Promise<UnixSocketRequestResult> {
  const signal = AbortSignal.timeout(params.timeoutMs);

  try {
    const response = await fetch(`http://localhost${params.requestPath}`, {
      unix: params.connectPath,
      method: params.method,
      signal: signal,
    });
    const bodyText = await response.text();

    if (!response.ok) {
      return {
        kind: 'failed',
        failure: { kind: 'requestFailed', status: response.status, code: null },
      };
    }

    return { kind: 'succeeded', value: { status: response.status, bodyText: bodyText } };
  } catch (error) {
    return { kind: 'failed', failure: toSendFailure({ error: error, isTimedOut: signal.aborted }) };
  }
}

function toSendFailure(params: { error: unknown; isTimedOut: boolean }): UnixSocketRequestFailure {
  if (params.isTimedOut) {
    return { kind: 'requestFailed', status: null, code: TIMED_OUT_CODE };
  }

  const code = getErrorCode(params.error);

  if (REFUSED_CODES.includes(code)) {
    return { kind: 'socketMissing' };
  }

  return { kind: 'requestFailed', status: null, code: code };
}
