import type { Result } from '../../result.js';
import { isJsonObject } from '../../system/parseJsonValue.js';
import { compareDottedVersions } from '../compareDottedVersions.js';

declare const engineApiVersionBrand: unique symbol;

/** An API version that both the engine and the parsers of its answers speak, such as `1.47`. */
export type EngineApiVersion = string & { [engineApiVersionBrand]: true };

/** The oldest version whose `/system/df` takes `type`, which the recheck before a removal asks. */
const OLDEST_API_VERSION = '1.42';

/** The newest version whose `/system/df` answers the lists `parseEngineDiskUsage` reads. */
const NEWEST_API_VERSION = '1.51';

const API_VERSION_PATTERN = /^\d+\.\d+$/;

/**
 * Picks the newest API version that the engine's `/version` answer allows and the parsers read;
 * fails for an answer without both versions, or with no version in common.
 */
export function parseEngineApiVersion(params: {
  value: unknown;
}): Result<EngineApiVersion, string> {
  if (!isJsonObject(params.value)) {
    return { kind: 'failed', failure: 'not an object' };
  }

  const newestOfEngine = params.value.ApiVersion;
  const oldestOfEngine = params.value.MinAPIVersion;

  if (typeof newestOfEngine !== 'string' || !API_VERSION_PATTERN.test(newestOfEngine)) {
    return { kind: 'failed', failure: 'no ApiVersion' };
  }

  if (typeof oldestOfEngine !== 'string' || !API_VERSION_PATTERN.test(oldestOfEngine)) {
    return { kind: 'failed', failure: 'no MinAPIVersion' };
  }

  const picked =
    compareDottedVersions(newestOfEngine, NEWEST_API_VERSION) < 0
      ? newestOfEngine
      : NEWEST_API_VERSION;

  if (
    compareDottedVersions(picked, OLDEST_API_VERSION) < 0 ||
    compareDottedVersions(picked, oldestOfEngine) < 0
  ) {
    return { kind: 'failed', failure: 'no API version in common' };
  }

  // The brand records the range check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: picked as EngineApiVersion };
}
