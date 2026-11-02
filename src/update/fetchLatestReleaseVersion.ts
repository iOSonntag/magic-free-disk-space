import type { Result } from '../result.js';
import { isJsonObject, parseJsonValue } from '../system/parseJsonValue.js';
import type { ReleaseVersion } from './releaseVersion.js';
import { parseReleaseTag } from './releaseVersion.js';

/** An answer of a release is a few KiB; a larger one is no answer of GitHub's API. */
const LATEST_RELEASE_BODY_MAX_BYTES = 262_144;

export type LatestReleaseFetchFailure = {
  reason: 'timedOut' | 'unreachable' | 'httpStatus' | 'bodyTooLarge' | 'invalidJson' | 'invalidTag';
};

export type LatestReleaseFetchResult = Result<ReleaseVersion, LatestReleaseFetchFailure>;

/**
 * Fetches the latest release at `url` and parses its `tag_name` strictly as `vX.Y.Z`. Sends
 * nothing but the GET request. Never throws.
 */
export async function fetchLatestReleaseVersion(params: {
  url: string;
  timeoutMs: number;
}): Promise<LatestReleaseFetchResult> {
  try {
    const response = await fetch(params.url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'magic-free-disk-space',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(params.timeoutMs),
    });

    if (!response.ok) {
      await response.body?.cancel();

      return { kind: 'failed', failure: { reason: 'httpStatus' } };
    }

    const bodyText = await loadBoundedBodyText({ response: response });

    if (bodyText === null) {
      return { kind: 'failed', failure: { reason: 'bodyTooLarge' } };
    }

    return parseLatestReleaseBody({ text: bodyText });
  } catch (e) {
    const reason =
      e instanceof DOMException && e.name === 'TimeoutError' ? 'timedOut' : 'unreachable';

    return { kind: 'failed', failure: { reason: reason } };
  }
}

/** The release of GitHub's answer; only `tag_name` is read. */
export function parseLatestReleaseBody(params: { text: string }): LatestReleaseFetchResult {
  const parsedJson = parseJsonValue({ text: params.text });

  if (parsedJson.kind === 'failed' || !isJsonObject(parsedJson.value)) {
    return { kind: 'failed', failure: { reason: 'invalidJson' } };
  }

  const tag = parsedJson.value.tag_name;
  const version = typeof tag === 'string' ? parseReleaseTag(tag) : null;

  if (version === null) {
    return { kind: 'failed', failure: { reason: 'invalidTag' } };
  }

  return { kind: 'succeeded', value: version };
}

/** `null` once the body passes the bound; the rest of it is never read. */
async function loadBoundedBodyText(params: { response: Response }): Promise<string | null> {
  if (params.response.body === null) {
    return '';
  }

  const reader = params.response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;

  for (;;) {
    const read = await reader.read();

    if (read.done) {
      break;
    }

    byteCount += read.value.byteLength;

    if (byteCount > LATEST_RELEASE_BODY_MAX_BYTES) {
      await reader.cancel();

      return null;
    }

    chunks.push(read.value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}
