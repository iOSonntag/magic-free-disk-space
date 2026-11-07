import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { UserIdentity } from '../../system/userIdentity.js';
import type { EngineApiVersion } from './parseEngineApiVersion.js';
import { parseEngineApiVersion } from './parseEngineApiVersion.js';
import type { EngineDiskUsage } from './parseEngineDiskUsage.js';
import { parseEngineDiskUsage } from './parseEngineDiskUsage.js';
import type { EngineRequestFailure } from './requestEngineEndpoint.js';
import { parseEngineJson, requestEngineEndpoint } from './requestEngineEndpoint.js';

/** The one list of `/system/df` a recheck asks for, by the name the API gives it. */
export type EngineUsageType = 'image' | 'container' | 'volume' | 'build-cache';

export type EngineState = {
  apiVersion: EngineApiVersion;
  usage: EngineDiskUsage;
};

/**
 * Pings the engine at `socketPath`, picks the API version both speak, and reads its disk usage
 * there: every list, or only `usageType`'s. Never rejects.
 */
export async function loadEngineState(params: {
  socketPath: AbsolutePath;
  user: UserIdentity;
  deadlineMs: number;
  usageType: EngineUsageType | null;
}): Promise<Result<EngineState, EngineRequestFailure>> {
  const ping = await requestEngineEndpoint({
    socketPath: params.socketPath,
    user: params.user,
    endpoint: '/_ping',
    requestPath: '/_ping',
    deadlineMs: params.deadlineMs,
    parse: parsePingAnswer,
  });

  if (ping.kind === 'failed') {
    return ping;
  }

  const apiVersion = await requestEngineEndpoint({
    socketPath: params.socketPath,
    user: params.user,
    endpoint: '/version',
    requestPath: '/version',
    deadlineMs: params.deadlineMs,
    parse: (answer) => parseEngineJson({ bodyText: answer.bodyText, parse: parseEngineApiVersion }),
  });

  if (apiVersion.kind === 'failed') {
    return apiVersion;
  }

  const query = params.usageType === null ? '' : `?type=${params.usageType}`;
  const usage = await requestEngineEndpoint({
    socketPath: params.socketPath,
    user: params.user,
    endpoint: '/system/df',
    requestPath: `/v${apiVersion.value}/system/df${query}`,
    deadlineMs: params.deadlineMs,
    parse: (answer) => parseEngineJson({ bodyText: answer.bodyText, parse: parseEngineDiskUsage }),
  });

  if (usage.kind === 'failed') {
    return usage;
  }

  return { kind: 'succeeded', value: { apiVersion: apiVersion.value, usage: usage.value } };
}

/** The engine answers its ping with `OK` alone. */
function parsePingAnswer(params: { bodyText: string }): Result<null, string> {
  if (params.bodyText.trim() !== 'OK') {
    return { kind: 'failed', failure: 'not OK' };
  }

  return { kind: 'succeeded', value: null };
}
