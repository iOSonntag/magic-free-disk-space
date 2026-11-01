import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import type { LatestReleaseFetchFailure } from '../../src/update/fetchLatestReleaseVersion.js';
import {
  fetchLatestReleaseVersion,
  parseLatestReleaseBody,
} from '../../src/update/fetchLatestReleaseVersion.js';
import { LATEST_RELEASE_FETCH_TIMEOUT_MS } from '../../src/update/githubRelease.js';

const TEST_TIMEOUT_MS = 200;

let server: Server<undefined> | null = null;

afterEach(async () => {
  await server?.stop(true);
  server = null;
});

/** A server on 127.0.0.1 that answers every request with `answer`; never GitHub. */
function startLocalServer(answer: (request: Request) => Response | Promise<Response>): string {
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answer });

  return `http://127.0.0.1:${server.port}/repos/owner/repo/releases/latest`;
}

describe('fetchLatestReleaseVersion', () => {
  test('parses the tag of the latest release and sends GitHub headers on a GET', async () => {
    const receivedRequests: Array<{ method: string; headers: Record<string, string> }> = [];
    const url = startLocalServer((request) => {
      receivedRequests.push({
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
      });

      return Response.json({ tag_name: 'v1.3.0', html_url: 'https://example.com/elsewhere' });
    });

    expect(await fetchLatestReleaseVersion({ url: url, timeoutMs: TEST_TIMEOUT_MS })).toEqual({
      kind: 'succeeded',
      value: { major: 1, minor: 3, patch: 0 },
    });
    expect(receivedRequests).toEqual([
      {
        method: 'GET',
        headers: expect.objectContaining({
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'magic-free-disk-space',
        }),
      },
    ]);
  });

  test('fails with httpStatus on a status that is no success', async () => {
    for (const status of [403, 404, 500]) {
      const url = startLocalServer(() => Response.json({ tag_name: 'v9.9.9' }, { status: status }));

      expect(await fetchLatestReleaseVersion({ url: url, timeoutMs: TEST_TIMEOUT_MS })).toEqual({
        kind: 'failed',
        failure: { reason: 'httpStatus' },
      });
      await server?.stop(true);
    }
  });

  test('fails with bodyTooLarge on an answer over the bound', async () => {
    const url = startLocalServer(
      () => new Response(`{"tag_name":"v1.3.0","body":"${'x'.repeat(300_000)}"}`),
    );

    expect(await fetchLatestReleaseVersion({ url: url, timeoutMs: TEST_TIMEOUT_MS })).toEqual({
      kind: 'failed',
      failure: { reason: 'bodyTooLarge' },
    });
  });

  test('fails with invalidJson or invalidTag on a body it cannot use', async () => {
    const bodies = new Map<string, LatestReleaseFetchFailure['reason']>([
      ['not json', 'invalidJson'],
      ['["v1.3.0"]', 'invalidJson'],
      ['{}', 'invalidTag'],
      ['{"tag_name":"1.3.0"}', 'invalidTag'],
      ['{"tag_name":"v1.3.0-rc.1"}', 'invalidTag'],
      ['{"tag_name":130}', 'invalidTag'],
    ]);

    for (const [body, reason] of bodies) {
      const url = startLocalServer(() => new Response(body));

      expect(await fetchLatestReleaseVersion({ url: url, timeoutMs: TEST_TIMEOUT_MS })).toEqual({
        kind: 'failed',
        failure: { reason: reason },
      });
      await server?.stop(true);
    }
  });

  test('fails with timedOut when the server does not answer within the limit', async () => {
    const url = startLocalServer(() => new Promise<Response>(() => {}));

    expect(await fetchLatestReleaseVersion({ url: url, timeoutMs: 100 })).toEqual({
      kind: 'failed',
      failure: { reason: 'timedOut' },
    });
  });

  test('fails with unreachable when nothing listens', async () => {
    const url = startLocalServer(() => new Response('{}'));

    await server?.stop(true);

    expect(await fetchLatestReleaseVersion({ url: url, timeoutMs: TEST_TIMEOUT_MS })).toEqual({
      kind: 'failed',
      failure: { reason: 'unreachable' },
    });
  });

  test('waits 5 s for GitHub in production', () => {
    expect(LATEST_RELEASE_FETCH_TIMEOUT_MS).toBe(5_000);
  });
});

describe('parseLatestReleaseBody', () => {
  test('reads only tag_name', () => {
    expect(parseLatestReleaseBody({ text: '{"tag_name":"v0.0.1","name":"v99.0.0"}' })).toEqual({
      kind: 'succeeded',
      value: { major: 0, minor: 0, patch: 1 },
    });
  });
});
