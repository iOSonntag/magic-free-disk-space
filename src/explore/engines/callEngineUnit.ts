import type { Result } from '../../result.js';
import { isJsonObject } from '../../system/parseJsonValue.js';
import type { UnixSocketMethod, UnixSocketRequestResult } from '../../system/requestUnixSocket.js';
import { requestUnixSocket } from '../../system/requestUnixSocket.js';
import type { UserIdentity } from '../../system/userIdentity.js';
import type { ExploreEngineUnit } from '../exploreUnit.js';
import { isEngineUnitUnchanged } from './isEngineUnitUnchanged.js';
import type { EngineState, EngineUsageType } from './loadEngineState.js';
import { loadEngineState } from './loadEngineState.js';
import type { EngineRequestFailure } from './requestEngineEndpoint.js';
import { parseEngineJson } from './requestEngineEndpoint.js';

export type EngineUnitCallRemoved = {
  outcome: 'removed';
  freedBytes: number;
  /** The HTTP status of the answer that removed it. */
  status: number;
};

export type EngineUnitCallAlreadyGone = {
  outcome: 'alreadyGone';
  freedBytes: number;
  /** The HTTP status of the answer that named it gone. */
  status: number;
};

export type EngineUnitCallEngineInUse = {
  outcome: 'engineInUse';
  freedBytes: number;
  /** The HTTP status of the answer that kept it. */
  status: number;
};

export type EngineUnitCallChangedSinceScan = {
  outcome: 'changedSinceScan';
  freedBytes: number;
};

export type EngineUnitCallEngineNotRunning = {
  outcome: 'engineNotRunning';
  freedBytes: number;
};

export type EngineUnitCallFailed = {
  outcome: 'failed';
  freedBytes: number;
  /** The HTTP status of the answer that failed; `null` when none came. */
  status: number | null;
  /** The error of a request that got no answer, `HTTP <status>`, or `badAnswer`. */
  code: string | null;
};

/**
 * How the calls of one unit ended; each outcome is a kind of the delete flow's outcome. Its
 * `freedBytes` is what every call freed in the engine's disk image: the engine's own count for build
 * cache, else the size the engine gave for what went.
 */
export type EngineUnitCall =
  | EngineUnitCallRemoved
  | EngineUnitCallAlreadyGone
  | EngineUnitCallEngineInUse
  | EngineUnitCallChangedSinceScan
  | EngineUnitCallEngineNotRunning
  | EngineUnitCallFailed;

type EngineUnitCallOutcome = EngineUnitCall['outcome'];

/** One removal request, and the bytes it frees when the engine names no count of its own. */
type EngineRemovalRequest = {
  method: UnixSocketMethod;
  requestPath: string;
  sizeBytes: number;
  /** The build cache record a prune must name as deleted; `null` for a `DELETE`. */
  prunedRecordId: string | null;
};

/** The list each kind of unit is read again from. */
const USAGE_TYPES: Record<ExploreEngineUnit['kind'], EngineUsageType> = {
  engineBuildCache: 'build-cache',
  engineDanglingImages: 'image',
  engineImage: 'image',
  engineContainer: 'container',
  engineVolume: 'volume',
};

/** Which outcome of the calls of one unit decides it, the most telling first. */
const OUTCOME_PRECEDENCE: EngineUnitCallOutcome[] = [
  'failed',
  'changedSinceScan',
  'engineNotRunning',
  'engineInUse',
  'removed',
  'alreadyGone',
];

/** The outcomes after which no further request of the unit is sent. */
const STOPPING_OUTCOMES: EngineUnitCallOutcome[] = [
  'failed',
  'changedSinceScan',
  'engineNotRunning',
];

const STATUS_NOT_FOUND = 404;

const STATUS_CONFLICT = 409;

/**
 * Checks the unit again at the socket its probe trusted, the same ids still unused, then removes
 * it there, never with `force`: one request per id, in turn, until the socket goes or a request
 * fails. Sends no removal when the socket is gone or untrusted, or the unit changed. Each request
 * waits up to `timeoutMs`. Never rejects.
 */
export async function callEngineUnit(params: {
  unit: ExploreEngineUnit;
  user: UserIdentity;
  timeoutMs: number;
}): Promise<EngineUnitCall> {
  const state = await loadEngineState({
    socketPath: params.unit.socketPath,
    user: params.user,
    deadlineMs: Date.now() + params.timeoutMs,
    usageType: USAGE_TYPES[params.unit.kind],
  });

  if (state.kind === 'failed') {
    return buildRecheckFailureCall({ failure: state.failure });
  }

  if (!isEngineUnitUnchanged({ unit: params.unit, usage: state.value.usage, nowMs: Date.now() })) {
    return { outcome: 'changedSinceScan', freedBytes: 0 };
  }

  const calls: EngineUnitCall[] = [];

  for (const request of listRemovalRequests({ unit: params.unit, state: state.value })) {
    const answer = await requestUnixSocket({
      socketPath: params.unit.socketPath,
      user: params.user,
      method: request.method,
      requestPath: request.requestPath,
      timeoutMs: params.timeoutMs,
    });
    const call = toRemovalCall({ request: request, answer: answer });

    calls.push(call);

    if (STOPPING_OUTCOMES.includes(call.outcome)) {
      break;
    }
  }

  return combineCalls({ calls: calls });
}

/** Nothing was sent but the reads, so nothing was freed. */
function buildRecheckFailureCall(params: { failure: EngineRequestFailure }): EngineUnitCall {
  switch (params.failure.kind) {
    case 'socketMissing':
      return { outcome: 'engineNotRunning', freedBytes: 0 };
    case 'socketUntrusted':
      return { outcome: 'changedSinceScan', freedBytes: 0 };
    case 'requestFailed':
      return {
        outcome: 'failed',
        freedBytes: 0,
        status: params.failure.status,
        code: toFailureCode({ status: params.failure.status, code: params.failure.code }),
      };
    case 'badAnswer':
      return { outcome: 'failed', freedBytes: 0, status: null, code: 'badAnswer' };
  }
}

function listRemovalRequests(params: {
  unit: ExploreEngineUnit;
  state: EngineState;
}): EngineRemovalRequest[] {
  const prefix = `/v${params.state.apiVersion}`;

  switch (params.unit.kind) {
    case 'engineBuildCache':
      // The engine takes one id per prune; `all` lets it prune a record of any type.
      return params.unit.recordIds.map((recordId) => ({
        method: 'POST',
        requestPath: `${prefix}/build/prune?all=true&filters=${encodeURIComponent(
          JSON.stringify({ id: [recordId] }),
        )}`,
        sizeBytes: 0,
        prunedRecordId: recordId,
      }));
    case 'engineDanglingImages':
      return params.unit.imageIds.map((imageId) => ({
        method: 'DELETE',
        requestPath: `${prefix}/images/${imageId}`,
        sizeBytes:
          params.state.usage.images.find((image) => image.id === imageId)?.uniqueSizeBytes ?? 0,
        prunedRecordId: null,
      }));
    case 'engineImage':
      return [
        {
          method: 'DELETE',
          requestPath: `${prefix}/images/${params.unit.imageId}`,
          sizeBytes: params.unit.sizeBytes,
          prunedRecordId: null,
        },
      ];
    case 'engineContainer':
      return [
        {
          method: 'DELETE',
          requestPath: `${prefix}/containers/${params.unit.containerId}`,
          sizeBytes: params.unit.sizeBytes,
          prunedRecordId: null,
        },
      ];
    case 'engineVolume':
      return [
        {
          method: 'DELETE',
          requestPath: `${prefix}/volumes/${params.unit.volumeName}`,
          sizeBytes: params.unit.sizeBytes,
          prunedRecordId: null,
        },
      ];
  }
}

function toRemovalCall(params: {
  request: EngineRemovalRequest;
  answer: UnixSocketRequestResult;
}): EngineUnitCall {
  if (params.answer.kind === 'failed') {
    switch (params.answer.failure.kind) {
      case 'socketMissing':
        return { outcome: 'engineNotRunning', freedBytes: 0 };
      case 'socketUntrusted':
        return { outcome: 'changedSinceScan', freedBytes: 0 };
      case 'requestFailed':
        return toRefusalCall({
          status: params.answer.failure.status,
          code: params.answer.failure.code,
        });
    }
  }

  if (params.request.prunedRecordId === null) {
    return {
      outcome: 'removed',
      freedBytes: params.request.sizeBytes,
      status: params.answer.value.status,
    };
  }

  const prune = parseEngineJson({
    bodyText: params.answer.value.bodyText,
    parse: parsePruneAnswer,
  });

  if (prune.kind === 'failed') {
    return {
      outcome: 'failed',
      freedBytes: 0,
      status: params.answer.value.status,
      code: 'badAnswer',
    };
  }

  if (!prune.value.deletedIds.includes(params.request.prunedRecordId)) {
    // The engine prunes no record a build holds, and says so only by leaving it out.
    return {
      outcome: 'engineInUse',
      freedBytes: 0,
      status: params.answer.value.status,
    };
  }

  return {
    outcome: 'removed',
    freedBytes: prune.value.freedBytes,
    status: params.answer.value.status,
  };
}

function toRefusalCall(params: { status: number | null; code: string | null }): EngineUnitCall {
  if (params.status === STATUS_NOT_FOUND) {
    return { outcome: 'alreadyGone', freedBytes: 0, status: params.status };
  }

  if (params.status === STATUS_CONFLICT) {
    return { outcome: 'engineInUse', freedBytes: 0, status: params.status };
  }

  return {
    outcome: 'failed',
    freedBytes: 0,
    status: params.status,
    code: toFailureCode({ status: params.status, code: params.code }),
  };
}

function toFailureCode(params: { status: number | null; code: string | null }): string | null {
  return params.status === null ? params.code : `HTTP ${params.status}`;
}

/** The answer of `POST /build/prune`. */
function parsePruneAnswer(params: {
  value: unknown;
}): Result<{ deletedIds: string[]; freedBytes: number }, string> {
  if (!isJsonObject(params.value)) {
    return { kind: 'failed', failure: 'not an object' };
  }

  const deletedIds = params.value.CachesDeleted ?? [];
  const freedBytes = params.value.SpaceReclaimed;

  if (!Array.isArray(deletedIds) || !deletedIds.every((id) => typeof id === 'string')) {
    return { kind: 'failed', failure: 'no CachesDeleted' };
  }

  if (typeof freedBytes !== 'number' || !Number.isSafeInteger(freedBytes) || freedBytes < 0) {
    return { kind: 'failed', failure: 'no SpaceReclaimed' };
  }

  return { kind: 'succeeded', value: { deletedIds: deletedIds, freedBytes: freedBytes } };
}

/** The unit's outcome is its most telling call's; the freed bytes are every call's. */
function combineCalls(params: { calls: EngineUnitCall[] }): EngineUnitCall {
  const freedBytes = params.calls.reduce((total, call) => total + call.freedBytes, 0);

  for (const outcome of OUTCOME_PRECEDENCE) {
    const decidingCall = params.calls.find((call) => call.outcome === outcome);

    if (decidingCall !== undefined) {
      return { ...decidingCall, freedBytes: freedBytes };
    }
  }

  return { outcome: 'changedSinceScan', freedBytes: 0 };
}
