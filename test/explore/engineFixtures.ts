import type { EngineProbeId } from '../../src/catalog/catalog.js';
import type {
  EngineBuildRecordId,
  EngineContainerId,
  EngineImageId,
  EngineVolumeName,
} from '../../src/explore/engines/engineObjectIds.js';
import type { ExploreEngineUnitPlace } from '../../src/explore/exploreUnit.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

/**
 * Made-up engine answers in the shape of the Docker Engine API; no value comes from a real
 * engine, and every socket is one a test serves in its own fixture folder.
 */
export const FAKE_API_VERSION = '1.47';

export const FAKE_VERSION_ANSWER = { ApiVersion: FAKE_API_VERSION, MinAPIVersion: '1.24' };

export const NOW_MS = Date.UTC(2026, 9, 1);

export const DAY_MS = 24 * 60 * 60 * 1000;

export type FakeEngineRequest = { method: string; path: string; bodyText: string };

export type FakeEngineAnswer = { status: number; bodyText: string };

export type FakeEngine = {
  /** Each request as `METHOD path?query`, its query decoded. */
  requests: string[];
  setUsage: (usage: unknown) => void;
  stop: () => void;
};

/**
 * Serves a fake engine at `socketPath`: its ping, its version, and `usage` as the answer of
 * `/system/df`, with `diskUsageStatus` (200 without it); every other request goes to
 * `answerRequest`, or gets a 404.
 */
export function startFakeEngine(params: {
  socketPath: string;
  usage: unknown;
  versionAnswer?: unknown;
  diskUsageStatus?: number;
  answerRequest?: (request: FakeEngineRequest) => FakeEngineAnswer;
}): FakeEngine {
  const requests: string[] = [];
  let usage = params.usage;
  const server = Bun.serve({
    unix: params.socketPath,
    fetch: async (request) => {
      const url = new URL(request.url);
      const path = `${url.pathname}${decodeURIComponent(url.search)}`;

      requests.push(`${request.method} ${path}`);

      if (request.method === 'GET' && url.pathname === '/_ping') {
        return new Response('OK');
      }

      if (request.method === 'GET' && url.pathname === '/version') {
        return Response.json(params.versionAnswer ?? FAKE_VERSION_ANSWER);
      }

      if (request.method === 'GET' && url.pathname === `/v${FAKE_API_VERSION}/system/df`) {
        return Response.json(usage, { status: params.diskUsageStatus ?? 200 });
      }

      const answer = params.answerRequest?.({
        method: request.method,
        path: path,
        bodyText: await request.text(),
      }) ?? { status: 404, bodyText: JSON.stringify({ message: 'page not found' }) };

      return new Response(answer.status === 204 ? null : answer.bodyText, {
        status: answer.status,
      });
    },
  });

  return {
    requests: requests,
    setUsage: (nextUsage) => {
      usage = nextUsage;
    },
    stop: () => {
      server.stop(true);
    },
  };
}

export function buildImageId(digit: string): EngineImageId {
  // A test id in the shape the parser checks.
  return `sha256:${digit.repeat(64)}` as EngineImageId;
}

export function buildContainerId(digit: string): EngineContainerId {
  // A test id in the shape the parser checks.
  return digit.repeat(64) as EngineContainerId;
}

export function buildVolumeName(text: string): EngineVolumeName {
  // A test name in the shape the parser checks.
  return text as EngineVolumeName;
}

export function buildBuildRecordId(digit: string): EngineBuildRecordId {
  // A test id in the shape BuildKit gives, 25 letters and digits.
  return `${'k'.repeat(24)}${digit}` as EngineBuildRecordId;
}

export function buildImageRecord(params: {
  digit: string;
  tags?: string[];
  digests?: string[];
  sizeBytes?: number;
  sharedSizeBytes?: number;
  containerCount?: number;
}): Record<string, unknown> {
  return {
    Id: buildImageId(params.digit),
    ParentId: '',
    RepoTags: params.tags ?? [],
    RepoDigests: params.digests ?? [],
    Created: 1_700_000_000,
    Size: params.sizeBytes ?? 1000,
    SharedSize: params.sharedSizeBytes ?? 0,
    Labels: {},
    Containers: params.containerCount ?? 0,
  };
}

export function buildContainerRecord(params: {
  digit: string;
  name?: string;
  state?: string;
  writableSizeBytes?: number | null;
}): Record<string, unknown> {
  const writableSizeBytes = params.writableSizeBytes === undefined ? 0 : params.writableSizeBytes;

  return {
    Id: buildContainerId(params.digit),
    Names: [`/${params.name ?? `box-${params.digit}`}`],
    Image: 'example/app:1',
    State: params.state ?? 'exited',
    Status: 'Exited (0) 3 days ago',
    ...(writableSizeBytes === null ? {} : { SizeRw: writableSizeBytes }),
  };
}

export function buildVolumeRecord(params: {
  name: string;
  sizeBytes?: number;
  referenceCount?: number;
}): Record<string, unknown> {
  return {
    Name: params.name,
    Driver: 'local',
    Mountpoint: `/var/lib/docker/volumes/${params.name}/_data`,
    UsageData: { Size: params.sizeBytes ?? 4096, RefCount: params.referenceCount ?? 0 },
  };
}

export function buildBuildRecord(params: {
  digit: string;
  sizeBytes?: number;
  lastUsedAtMs?: number | null;
  isInUse?: boolean;
  isShared?: boolean;
}): Record<string, unknown> {
  const lastUsedAtMs =
    params.lastUsedAtMs === undefined ? NOW_MS - 30 * DAY_MS : params.lastUsedAtMs;

  return {
    ID: buildBuildRecordId(params.digit),
    Parents: [],
    Type: 'regular',
    Description: 'a build step',
    InUse: params.isInUse ?? false,
    Shared: params.isShared ?? false,
    Size: params.sizeBytes ?? 2048,
    CreatedAt: new Date(NOW_MS - 60 * DAY_MS).toISOString(),
    LastUsedAt: lastUsedAtMs === null ? null : new Date(lastUsedAtMs).toISOString(),
    UsageCount: 1,
  };
}

export function buildDiskUsageAnswer(params: {
  images?: Record<string, unknown>[];
  containers?: Record<string, unknown>[];
  volumes?: Record<string, unknown>[];
  buildRecords?: Record<string, unknown>[];
}): Record<string, unknown> {
  return {
    LayersSize: 0,
    Images: params.images ?? [],
    Containers: params.containers ?? [],
    Volumes: params.volumes ?? [],
    BuildCache: params.buildRecords ?? [],
  };
}

/** The place of a fake engine's units, its socket and disk image in `homeDir`. */
export function buildFakeUnitPlace(params: {
  homeDir: string;
  engineProbeId?: EngineProbeId;
}): Omit<ExploreEngineUnitPlace, 'sizeBytes'> {
  return {
    engineProbeId: params.engineProbeId ?? 'dockerDesktopEngine',
    engineName: 'Docker Desktop',
    socketPath: buildTestAbsolutePath({ text: `${params.homeDir}/engine.sock` }),
    diskImagePath: buildTestAbsolutePath({ text: `${params.homeDir}/disk.img` }),
  };
}
