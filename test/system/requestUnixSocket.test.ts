import { afterEach, beforeEach, expect, test } from 'bun:test';
import { link, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requestUnixSocket } from '../../src/system/requestUnixSocket.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { buildTestUserIdentity, buildTestWindowsUser } from '../support/parsedValueFixtures.js';

const USER = buildTestUserIdentity({ uid: process.getuid?.() ?? 0 });

const OTHER_USER = buildTestUserIdentity({ uid: (process.getuid?.() ?? 0) + 1 });

const TIMEOUT_MS = 5_000;

type CountingServer = { server: ReturnType<typeof Bun.serve>; requestPaths: string[] };

function startCountingServer(params: {
  socketPath: string;
  answer: (request: Request) => Response | Promise<Response>;
}): CountingServer {
  const requestPaths: string[] = [];
  const server = Bun.serve({
    unix: params.socketPath,
    fetch: (request) => {
      const url = new URL(request.url);
      requestPaths.push(`${request.method} ${url.pathname}${url.search}`);

      return params.answer(request);
    },
  });

  return { server: server, requestPaths: requestPaths };
}

describeAwaitingWin32Platform('requestUnixSocket', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('answers over a socket the user owns, with the status and the body', async () => {
    const socketPath = join(fixtureRoot.rootDir, 'engine.sock');
    const served = startCountingServer({
      socketPath: socketPath,
      answer: () => new Response('OK'),
    });

    try {
      const result = await requestUnixSocket({
        socketPath: socketPath,
        user: USER,
        method: 'GET',
        requestPath: '/v1.47/system/df?type=image',
        timeoutMs: TIMEOUT_MS,
      });

      expect(result).toEqual({ kind: 'succeeded', value: { status: 200, bodyText: 'OK' } });
      expect(served.requestPaths).toEqual(['GET /v1.47/system/df?type=image']);
    } finally {
      served.server.stop(true);
    }
  });

  test('answers socketMissing for a path with no entry', async () => {
    const result = await requestUnixSocket({
      socketPath: join(fixtureRoot.rootDir, 'missing.sock'),
      user: USER,
      method: 'GET',
      requestPath: '/_ping',
      timeoutMs: TIMEOUT_MS,
    });

    expect(result).toEqual({ kind: 'failed', failure: { kind: 'socketMissing' } });
  });

  test('answers socketMissing for a stale socket that refuses the connect', async () => {
    const servedPath = join(fixtureRoot.rootDir, 'served.sock');
    const stalePath = join(fixtureRoot.rootDir, 'stale.sock');
    const served = startCountingServer({
      socketPath: servedPath,
      answer: () => new Response('OK'),
    });
    // A second name of the socket outlives the server, which unlinks only its own name.
    await link(servedPath, stalePath);
    served.server.stop(true);

    const result = await requestUnixSocket({
      socketPath: stalePath,
      user: USER,
      method: 'GET',
      requestPath: '/_ping',
      timeoutMs: TIMEOUT_MS,
    });

    expect(result).toEqual({ kind: 'failed', failure: { kind: 'socketMissing' } });
  });

  test('refuses a path that is no socket as notSocket', async () => {
    const filePath = join(fixtureRoot.rootDir, 'docker.sock');
    await writeFile(filePath, 'not a socket');

    const result = await requestUnixSocket({
      socketPath: filePath,
      user: USER,
      method: 'GET',
      requestPath: '/_ping',
      timeoutMs: TIMEOUT_MS,
    });

    expect(result).toEqual({
      kind: 'failed',
      failure: { kind: 'socketUntrusted', detail: 'notSocket' },
    });
  });

  test('refuses a socket another user owns as notOwnedByUser, sending nothing', async () => {
    const socketPath = join(fixtureRoot.rootDir, 'engine.sock');
    const served = startCountingServer({
      socketPath: socketPath,
      answer: () => new Response('OK'),
    });

    try {
      const result = await requestUnixSocket({
        socketPath: socketPath,
        user: OTHER_USER,
        method: 'DELETE',
        requestPath: '/v1.47/volumes/data',
        timeoutMs: TIMEOUT_MS,
      });

      expect(result).toEqual({
        kind: 'failed',
        failure: { kind: 'socketUntrusted', detail: 'notOwnedByUser' },
      });
      expect(served.requestPaths).toEqual([]);
    } finally {
      served.server.stop(true);
    }
  });

  test('refuses every socket for a user of Windows as notOwnedByUser, sending nothing', async () => {
    const socketPath = join(fixtureRoot.rootDir, 'engine.sock');
    const served = startCountingServer({
      socketPath: socketPath,
      answer: () => new Response('OK'),
    });

    try {
      const result = await requestUnixSocket({
        socketPath: socketPath,
        user: buildTestWindowsUser({ sidText: 'S-1-5-21-1000-2000-3000-1001' }),
        method: 'GET',
        requestPath: '/_ping',
        timeoutMs: TIMEOUT_MS,
      });

      expect(result).toEqual({
        kind: 'failed',
        failure: { kind: 'socketUntrusted', detail: 'notOwnedByUser' },
      });
      expect(served.requestPaths).toEqual([]);
    } finally {
      served.server.stop(true);
    }
  });

  test('follows a link the user owns to the socket it names', async () => {
    const socketPath = join(fixtureRoot.rootDir, 'engine.sock');
    const linkPath = join(fixtureRoot.rootDir, 'docker.sock');
    const served = startCountingServer({
      socketPath: socketPath,
      answer: () => new Response('OK'),
    });
    await symlink(socketPath, linkPath);

    try {
      const result = await requestUnixSocket({
        socketPath: linkPath,
        user: USER,
        method: 'GET',
        requestPath: '/_ping',
        timeoutMs: TIMEOUT_MS,
      });

      expect(result).toEqual({ kind: 'succeeded', value: { status: 200, bodyText: 'OK' } });
      expect(served.requestPaths).toEqual(['GET /_ping']);
    } finally {
      served.server.stop(true);
    }
  });

  test('refuses a link to a file that is no socket as notSocket', async () => {
    const filePath = join(fixtureRoot.rootDir, 'plain');
    const linkPath = join(fixtureRoot.rootDir, 'docker.sock');
    await writeFile(filePath, 'not a socket');
    await symlink(filePath, linkPath);

    const result = await requestUnixSocket({
      socketPath: linkPath,
      user: USER,
      method: 'GET',
      requestPath: '/_ping',
      timeoutMs: TIMEOUT_MS,
    });

    expect(result).toEqual({
      kind: 'failed',
      failure: { kind: 'socketUntrusted', detail: 'notSocket' },
    });
  });

  test('answers socketMissing for a link whose socket is gone', async () => {
    const linkPath = join(fixtureRoot.rootDir, 'docker.sock');
    await symlink(join(fixtureRoot.rootDir, 'gone.sock'), linkPath);

    const result = await requestUnixSocket({
      socketPath: linkPath,
      user: USER,
      method: 'GET',
      requestPath: '/_ping',
      timeoutMs: TIMEOUT_MS,
    });

    expect(result).toEqual({ kind: 'failed', failure: { kind: 'socketMissing' } });
  });

  test('fails with the status of an answer that is no success', async () => {
    const socketPath = join(fixtureRoot.rootDir, 'engine.sock');
    const served = startCountingServer({
      socketPath: socketPath,
      answer: () => Response.json({ message: 'conflict' }, { status: 409 }),
    });

    try {
      const result = await requestUnixSocket({
        socketPath: socketPath,
        user: USER,
        method: 'DELETE',
        requestPath: '/v1.47/volumes/data',
        timeoutMs: TIMEOUT_MS,
      });

      expect(result).toEqual({
        kind: 'failed',
        failure: { kind: 'requestFailed', status: 409, code: null },
      });
    } finally {
      served.server.stop(true);
    }
  });

  test('fails as timed out when no answer comes in time', async () => {
    const socketPath = join(fixtureRoot.rootDir, 'engine.sock');
    const served = startCountingServer({
      socketPath: socketPath,
      answer: () => new Promise<Response>(() => {}),
    });

    try {
      const result = await requestUnixSocket({
        socketPath: socketPath,
        user: USER,
        method: 'GET',
        requestPath: '/system/df',
        timeoutMs: 50,
      });

      expect(result).toEqual({
        kind: 'failed',
        failure: { kind: 'requestFailed', status: null, code: 'ETIMEDOUT' },
      });
    } finally {
      served.server.stop(true);
    }
  });
});
