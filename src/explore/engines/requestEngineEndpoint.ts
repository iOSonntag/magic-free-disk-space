import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import { parseJsonValue } from '../../system/parseJsonValue.js';
import { requestUnixSocket } from '../../system/requestUnixSocket.js';
import type { UserIdentity } from '../../system/userIdentity.js';
import type {
  EngineEndpoint,
  ExploreEngineAnswerFailure,
  ExploreEngineFailureSocketMissing,
  ExploreEngineFailureSocketUntrusted,
} from '../exploreProbe.js';

/** What a read of the engine meets instead of an answer its parser takes. */
export type EngineRequestFailure =
  | ExploreEngineFailureSocketMissing
  | ExploreEngineFailureSocketUntrusted
  | ExploreEngineAnswerFailure;

/** Reads one endpoint of the engine with `GET` at `socketPath` and parses its answer. Never rejects. */
export async function requestEngineEndpoint<TValue>(params: {
  socketPath: AbsolutePath;
  user: UserIdentity;
  endpoint: EngineEndpoint;
  /** The endpoint with its version prefix and query, such as `/v1.47/system/df?type=image`. */
  requestPath: string;
  deadlineMs: number;
  parse: (params: { bodyText: string }) => Result<TValue, string>;
}): Promise<Result<TValue, EngineRequestFailure>> {
  const answer = await requestUnixSocket({
    socketPath: params.socketPath,
    user: params.user,
    method: 'GET',
    requestPath: params.requestPath,
    timeoutMs: readEngineTimeoutMs({ deadlineMs: params.deadlineMs }),
  });

  if (answer.kind === 'failed') {
    switch (answer.failure.kind) {
      case 'socketMissing':
      case 'socketUntrusted':
        return { kind: 'failed', failure: answer.failure };
      case 'requestFailed':
        return {
          kind: 'failed',
          failure: {
            kind: 'requestFailed',
            endpoint: params.endpoint,
            status: answer.failure.status,
            code: answer.failure.code,
          },
        };
    }
  }

  const parsed = params.parse({ bodyText: answer.value.bodyText });

  if (parsed.kind === 'failed') {
    return { kind: 'failed', failure: { kind: 'badAnswer', endpoint: params.endpoint } };
  }

  return parsed;
}

/** Reads a JSON answer by `parse`; fails for text that is no JSON. */
export function parseEngineJson<TValue>(params: {
  bodyText: string;
  parse: (params: { value: unknown }) => Result<TValue, string>;
}): Result<TValue, string> {
  const value = parseJsonValue({ text: params.bodyText });

  if (value.kind === 'failed') {
    return value;
  }

  return params.parse({ value: value.value });
}

/** The time left until `deadlineMs`, at least 1 ms, so a late request still fails as timed out. */
function readEngineTimeoutMs(params: { deadlineMs: number }): number {
  return Math.max(params.deadlineMs - Date.now(), 1);
}
