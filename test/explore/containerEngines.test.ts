import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { buildEngineFindings } from '../../src/explore/engines/buildEngineFindings.js';
import { buildEngineProbe } from '../../src/explore/engines/buildEngineProbe.js';
import { callEngineUnit } from '../../src/explore/engines/callEngineUnit.js';
import { isEngineUnitUnchanged } from '../../src/explore/engines/isEngineUnitUnchanged.js';
import { loadEngineFindings } from '../../src/explore/engines/loadEngineFindings.js';
import { parseEngineApiVersion } from '../../src/explore/engines/parseEngineApiVersion.js';
import type { EngineDiskUsage } from '../../src/explore/engines/parseEngineDiskUsage.js';
import { parseEngineDiskUsage } from '../../src/explore/engines/parseEngineDiskUsage.js';
import type { ContainerEngineFixed } from '../../src/explore/explorePlatform.js';
import type { ExploreProbeEngineResult, ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type {
  ExploreEngineUnit,
  ExploreEngineUnitPlace,
  ExploreProbeFindings,
} from '../../src/explore/exploreUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { CONTAINER_ENGINES } from '../../src/platform/darwin/containerEngines.js';
import { DAY_MS } from '../../src/scan/limits.js';
import { exampleWin32Environment } from '../support/environmentFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { joinBelowHome } from '../support/parsedValueFixtures.js';
import { hostPlatform } from '../support/platformFixtures.js';
import { describeOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { buildTestProbeRun } from '../support/probeRunFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';
import type { FakeEngine } from './engineFixtures.js';
import {
  buildBuildRecord,
  buildBuildRecordId,
  buildContainerId,
  buildContainerRecord,
  buildDiskUsageAnswer,
  buildFakeUnitPlace,
  buildImageId,
  buildImageRecord,
  buildVolumeName,
  buildVolumeRecord,
  FAKE_API_VERSION,
  NOW_MS,
  startFakeEngine,
} from './engineFixtures.js';

const TIMEOUT_MS = 5_000;

const ANONYMOUS_VOLUME_NAME = 'a'.repeat(64);

const TEST_ENGINE: ContainerEngineFixed = {
  kind: 'fixed',
  engineName: 'Docker Desktop',
  socketPaths: [{ root: 'home', path: 'engine.sock' }],
  diskImagePath: { root: 'home', path: 'disk.img' },
};

function parseUsage(answer: unknown): EngineDiskUsage {
  const usage = parseEngineDiskUsage({ value: answer });

  if (usage.kind === 'failed') {
    throw new Error(`The test answer does not parse: ${usage.failure}`);
  }

  return usage.value;
}

/** An answer with one record of each unit kind and one of each kind the probe leaves alone. */
function buildMixedUsageAnswer(): Record<string, unknown> {
  return buildDiskUsageAnswer({
    buildRecords: [
      buildBuildRecord({ digit: '1', sizeBytes: 2048 }),
      buildBuildRecord({ digit: '2', lastUsedAtMs: NOW_MS - 2 * DAY_MS }),
      buildBuildRecord({ digit: '3', isInUse: true }),
      buildBuildRecord({ digit: '4', isShared: true }),
      buildBuildRecord({ digit: '5', sizeBytes: 1000, lastUsedAtMs: null }),
    ],
    images: [
      buildImageRecord({
        digit: '1',
        tags: ['<none>:<none>'],
        sizeBytes: 1000,
        sharedSizeBytes: 200,
      }),
      buildImageRecord({ digit: '2', containerCount: 1 }),
      buildImageRecord({
        digit: '3',
        tags: ['example/web:1'],
        digests: [`example/web@sha256:${'d'.repeat(64)}`],
        sizeBytes: 5000,
        sharedSizeBytes: 1000,
      }),
      buildImageRecord({ digit: '4', tags: ['local/tool:dev'] }),
      buildImageRecord({ digit: '5', tags: ['first/app:1', 'second/app:1'] }),
      buildImageRecord({ digit: '6', tags: ['example/db:2'], containerCount: 2 }),
    ],
    containers: [
      buildContainerRecord({ digit: '1', writableSizeBytes: 0 }),
      buildContainerRecord({ digit: '2', writableSizeBytes: 300 }),
      buildContainerRecord({ digit: '3', state: 'running' }),
      buildContainerRecord({ digit: '4', state: 'created', writableSizeBytes: null }),
    ],
    volumes: [
      buildVolumeRecord({ name: 'cache-data' }),
      buildVolumeRecord({ name: 'db', referenceCount: 1 }),
      buildVolumeRecord({ name: ANONYMOUS_VOLUME_NAME }),
    ],
  });
}

describe('parseEngineApiVersion', () => {
  test("picks the engine's newest version when the parsers read it", () => {
    expect<unknown>(
      parseEngineApiVersion({ value: { ApiVersion: '1.47', MinAPIVersion: '1.24' } }),
    ).toEqual({ kind: 'succeeded', value: '1.47' });
  });

  test('picks 1.51 from a newer engine, the last version with the lists the parser reads', () => {
    expect<unknown>(
      parseEngineApiVersion({ value: { ApiVersion: '1.53', MinAPIVersion: '1.24' } }),
    ).toEqual({ kind: 'succeeded', value: '1.51' });
  });

  test('fails for an engine older than 1.42 or one that no longer speaks 1.51', () => {
    expect(
      parseEngineApiVersion({ value: { ApiVersion: '1.41', MinAPIVersion: '1.12' } }).kind,
    ).toBe('failed');
    expect(
      parseEngineApiVersion({ value: { ApiVersion: '1.60', MinAPIVersion: '1.52' } }).kind,
    ).toBe('failed');
  });

  test('fails for an answer without its versions', () => {
    expect(parseEngineApiVersion({ value: { Version: '27.0.0' } }).kind).toBe('failed');
    expect(parseEngineApiVersion({ value: 'OK' }).kind).toBe('failed');
  });
});

describe('parseEngineDiskUsage', () => {
  test('reads each list into records, without placeholders and with unique sizes', () => {
    const usage = parseUsage(
      buildDiskUsageAnswer({
        images: [
          buildImageRecord({
            digit: '1',
            tags: ['<none>:<none>'],
            sizeBytes: 900,
            sharedSizeBytes: 300,
          }),
          buildImageRecord({
            digit: '2',
            tags: ['example/web:1'],
            sharedSizeBytes: -1,
            containerCount: -1,
          }),
        ],
        containers: [buildContainerRecord({ digit: '1', name: 'web', writableSizeBytes: 12 })],
        volumes: [buildVolumeRecord({ name: 'db', sizeBytes: -1, referenceCount: -1 })],
        buildRecords: [buildBuildRecord({ digit: '1', lastUsedAtMs: null })],
      }),
    );

    expect(usage).toEqual({
      images: [
        {
          id: buildImageId('1'),
          tags: [],
          digests: [],
          uniqueSizeBytes: 600,
          containerCount: 0,
        },
        {
          id: buildImageId('2'),
          tags: ['example/web:1'],
          digests: [],
          uniqueSizeBytes: 1000,
          containerCount: null,
        },
      ],
      containers: [
        { id: buildContainerId('1'), name: 'web', state: 'exited', writableSizeBytes: 12 },
      ],
      volumes: [{ name: buildVolumeName('db'), sizeBytes: null, referenceCount: null }],
      buildRecords: [
        {
          id: buildBuildRecordId('1'),
          isInUse: false,
          isShared: false,
          sizeBytes: 2048,
          lastUsedAtMs: NOW_MS - 60 * DAY_MS,
        },
      ],
    });
  });

  test('reads an image without its parent and a build record without its type', () => {
    const { ParentId: _parentId, ...imageRecord } = buildImageRecord({ digit: '1' });
    const { Type: _recordType, ...buildRecord } = buildBuildRecord({ digit: '1' });
    const usage = parseUsage(
      buildDiskUsageAnswer({ images: [imageRecord], buildRecords: [buildRecord] }),
    );

    expect(usage.images.map((image) => image.id)).toEqual([buildImageId('1')]);
    expect(usage.buildRecords.map((record) => record.id)).toEqual([buildBuildRecordId('1')]);
  });

  test('reads a list the answer leaves out as empty', () => {
    expect(parseUsage({ Images: null, Volumes: [] })).toEqual({
      images: [],
      containers: [],
      volumes: [],
      buildRecords: [],
    });
  });

  test('fails whole when one record does not parse', () => {
    const badRecords = [
      { Images: [{ ...buildImageRecord({ digit: '1' }), Id: 'sha256:short' }] },
      { Images: [{ ...buildImageRecord({ digit: '1' }), Size: -5 }] },
      { Containers: [{ ...buildContainerRecord({ digit: '1' }), Id: '--rm' }] },
      { Volumes: [buildVolumeRecord({ name: '-v' })] },
      { BuildCache: [{ ...buildBuildRecord({ digit: '1' }), ID: 'ABC|DEF' }] },
      { BuildCache: [{ ...buildBuildRecord({ digit: '1' }), LastUsedAt: 'yesterday' }] },
      { Containers: 'none' },
    ];

    for (const answer of badRecords) {
      expect(parseEngineDiskUsage({ value: { ...buildDiskUsageAnswer({}), ...answer } }).kind).toBe(
        'failed',
      );
    }
  });
});

describe('buildEngineFindings', () => {
  test('offers each unit with its risk, and leaves used, recent and shared records alone', () => {
    const findings = buildEngineFindings({
      place: buildFakeUnitPlace({ homeDir: '/Users/example' }),
      usage: parseUsage(buildMixedUsageAnswer()),
      nowMs: NOW_MS,
      runningProcesses: buildRunningCommandLines([]),
    });

    expect(
      findings.map((finding) => [finding.unit.kind, finding.risk, finding.title, finding.unit]),
    ).toEqual([
      [
        'engineBuildCache',
        'safe',
        'Docker Desktop build cache',
        expect.objectContaining({
          sizeBytes: 3048,
          recordIds: [buildBuildRecordId('1'), buildBuildRecordId('5')],
        }),
      ],
      [
        'engineDanglingImages',
        'safe',
        'Docker Desktop untagged images',
        expect.objectContaining({ sizeBytes: 800, imageIds: [buildImageId('1')] }),
      ],
      [
        'engineImage',
        'review',
        'Docker Desktop image example/web:1',
        expect.objectContaining({ sizeBytes: 4000, imageId: buildImageId('3') }),
      ],
      [
        'engineImage',
        'careful',
        'Docker Desktop image local/tool:dev',
        expect.objectContaining({ sizeBytes: 1000, imageId: buildImageId('4') }),
      ],
      [
        'engineContainer',
        'review',
        'Docker Desktop container box-1',
        expect.objectContaining({ sizeBytes: 0, containerId: buildContainerId('1') }),
      ],
      [
        'engineContainer',
        'careful',
        'Docker Desktop container box-2',
        expect.objectContaining({ sizeBytes: 300, containerId: buildContainerId('2') }),
      ],
      [
        'engineContainer',
        'careful',
        'Docker Desktop container box-4',
        expect.objectContaining({ sizeBytes: 0, containerId: buildContainerId('4') }),
      ],
      [
        'engineVolume',
        'careful',
        'Docker Desktop volume cache-data',
        expect.objectContaining({ sizeBytes: 4096, volumeName: 'cache-data' }),
      ],
      [
        'engineVolume',
        'careful',
        'Docker Desktop anonymous volume aaaaaaaaaaaa',
        expect.objectContaining({ volumeName: ANONYMOUS_VOLUME_NAME }),
      ],
    ]);
    expect(new Set(findings.map((finding) => finding.activity))).toEqual(new Set(['idle']));
    expect(new Set(findings.map((finding) => finding.displayPath))).toEqual(
      new Set(['/Users/example/disk.img']),
    );
  });

  test('offers nothing for an engine with nothing unused', () => {
    expect(
      buildEngineFindings({
        place: buildFakeUnitPlace({ homeDir: '/Users/example' }),
        usage: parseUsage(
          buildDiskUsageAnswer({
            images: [buildImageRecord({ digit: '1', tags: ['example/web:1'], containerCount: 1 })],
            containers: [buildContainerRecord({ digit: '1', state: 'running' })],
          }),
        ),
        nowMs: NOW_MS,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual([]);
  });

  test('offers no image of two tags in one repository, which the engine removes only by force', () => {
    expect(
      buildEngineFindings({
        place: buildFakeUnitPlace({ homeDir: '/Users/example' }),
        usage: parseUsage(
          buildDiskUsageAnswer({
            images: [buildImageRecord({ digit: '1', tags: ['app:1', 'app:latest'] })],
          }),
        ),
        nowMs: NOW_MS,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual([]);
  });
});

describe('isEngineUnitUnchanged', () => {
  const place = { ...buildFakeUnitPlace({ homeDir: '/Users/example' }), sizeBytes: 300 };
  const containerUnit: ExploreEngineUnit = {
    kind: 'engineContainer',
    ...place,
    containerId: buildContainerId('2'),
  };

  test('holds while the container is stopped with the same layer', () => {
    expect(
      isEngineUnitUnchanged({
        unit: containerUnit,
        usage: parseUsage(buildMixedUsageAnswer()),
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  test('fails for a container that is gone, runs, or wrote since the scan', () => {
    const answers = [
      buildDiskUsageAnswer({}),
      buildDiskUsageAnswer({
        containers: [buildContainerRecord({ digit: '2', state: 'running' })],
      }),
      buildDiskUsageAnswer({
        containers: [buildContainerRecord({ digit: '2', writableSizeBytes: 400 })],
      }),
    ];

    for (const answer of answers) {
      expect(
        isEngineUnitUnchanged({ unit: containerUnit, usage: parseUsage(answer), nowMs: NOW_MS }),
      ).toBe(false);
    }
  });

  test('fails for a build record used since the scan, or whose id another record holds', () => {
    const unit: ExploreEngineUnit = {
      kind: 'engineBuildCache',
      ...place,
      recordIds: [buildBuildRecordId('1')],
    };
    const holdingRecord = {
      ...buildBuildRecord({ digit: '9' }),
      ID: `${buildBuildRecordId('1')}x`,
    };

    expect(
      isEngineUnitUnchanged({
        unit: unit,
        usage: parseUsage(
          buildDiskUsageAnswer({ buildRecords: [buildBuildRecord({ digit: '1' })] }),
        ),
        nowMs: NOW_MS,
      }),
    ).toBe(true);
    expect(
      isEngineUnitUnchanged({
        unit: unit,
        usage: parseUsage(
          buildDiskUsageAnswer({
            buildRecords: [buildBuildRecord({ digit: '1', lastUsedAtMs: NOW_MS - DAY_MS })],
          }),
        ),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
    expect(
      isEngineUnitUnchanged({
        unit: unit,
        usage: parseUsage(
          buildDiskUsageAnswer({ buildRecords: [buildBuildRecord({ digit: '1' }), holdingRecord] }),
        ),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  test('fails for an image a container uses now, and for a unit without ids', () => {
    expect(
      isEngineUnitUnchanged({
        unit: { kind: 'engineImage', ...place, imageId: buildImageId('4') },
        usage: parseUsage(
          buildDiskUsageAnswer({
            images: [buildImageRecord({ digit: '4', tags: ['local/tool:dev'], containerCount: 1 })],
          }),
        ),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
    expect(
      isEngineUnitUnchanged({
        unit: { kind: 'engineDanglingImages', ...place, imageIds: [] },
        usage: parseUsage(buildMixedUsageAnswer()),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  test('fails for untagged images one of which is tagged now, and an image whose id is gone', () => {
    expect(
      isEngineUnitUnchanged({
        unit: { kind: 'engineDanglingImages', ...place, imageIds: [buildImageId('1')] },
        usage: parseUsage(
          buildDiskUsageAnswer({
            images: [buildImageRecord({ digit: '1', tags: ['example/app:1'] })],
          }),
        ),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
    expect(
      isEngineUnitUnchanged({
        unit: { kind: 'engineImage', ...place, imageId: buildImageId('9') },
        usage: parseUsage(buildMixedUsageAnswer()),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  test('fails for an image that gained a second tag since the scan', () => {
    const unit: ExploreEngineUnit = { kind: 'engineImage', ...place, imageId: buildImageId('1') };

    expect(
      isEngineUnitUnchanged({
        unit: unit,
        usage: parseUsage(
          buildDiskUsageAnswer({ images: [buildImageRecord({ digit: '1', tags: ['app:1'] })] }),
        ),
        nowMs: NOW_MS,
      }),
    ).toBe(true);
    expect(
      isEngineUnitUnchanged({
        unit: unit,
        usage: parseUsage(
          buildDiskUsageAnswer({
            images: [buildImageRecord({ digit: '1', tags: ['app:1', 'app:latest'] })],
          }),
        ),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  test('fails for a volume a container mounts now', () => {
    expect(
      isEngineUnitUnchanged({
        unit: {
          kind: 'engineVolume',
          ...place,
          sizeBytes: 4096,
          volumeName: buildVolumeName('db'),
        },
        usage: parseUsage(buildMixedUsageAnswer()),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });
});

describe('the engine probe on a platform without the engine', () => {
  test('answers socketMissing, as for an engine whose socket is missing', async () => {
    const probe = buildEngineProbe('dockerDesktopEngine');

    expect(
      await probe.loadFindings(
        buildTestProbeRun({
          environment: exampleWin32Environment,
          platform: buildTestProbePlatform({
            explore: {
              containerEngines: {
                ...hostPlatform.explore.containerEngines,
                dockerDesktopEngine: null,
              },
            },
          }),
        }),
      ),
    ).toEqual({ kind: 'failed', failure: { kind: 'socketMissing' } });
  });
});

// The fake engine serves on a Unix socket, as the engines of macOS do.
describeOnPosix('the engine probe and its removal over a fake engine', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;
  let socketPath: AbsolutePath;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
    socketPath = joinBelowHome({ home: environment, path: 'engine.sock' });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  function buildRun(): ExploreProbeRun {
    return buildTestProbeRun({ environment: environment });
  }

  function buildPlace(sizeBytes: number): ExploreEngineUnitPlace {
    return { ...buildFakeUnitPlace({ homeDir: environment.homeDir }), sizeBytes: sizeBytes };
  }

  test('answers socketMissing when none of the socket paths exists, and sends nothing', async () => {
    const findings = await loadEngineFindings({
      run: buildRun(),
      engineProbeId: 'dockerDesktopEngine',
      engine: {
        ...TEST_ENGINE,
        socketPaths: [
          { root: 'home', path: 'missing.sock' },
          { root: 'home', path: 'also-missing.sock' },
        ],
      },
    });

    expect(findings).toEqual({ kind: 'failed', failure: { kind: 'socketMissing' } });
  });

  test('asks only the first socket path that exists, and refuses it when it is no socket', async () => {
    await writeFixtureTextFile({
      path: join(environment.homeDir, 'plain.sock'),
      text: 'not a socket',
    });
    const engine = startFakeEngine({ socketPath: socketPath, usage: buildMixedUsageAnswer() });

    try {
      const findings = await loadEngineFindings({
        run: buildRun(),
        engineProbeId: 'dockerDesktopEngine',
        engine: {
          ...TEST_ENGINE,
          socketPaths: [
            { root: 'home', path: 'missing.sock' },
            { root: 'home', path: 'plain.sock' },
            { root: 'home', path: 'engine.sock' },
          ],
        },
      });

      expect(findings).toEqual({
        kind: 'failed',
        failure: { kind: 'socketUntrusted', detail: 'notSocket' },
      });
      expect(engine.requests).toEqual([]);
    } finally {
      engine.stop();
    }
  });

  test('reads the ping, the version and the disk usage, and offers the units at that socket', async () => {
    const engine = startFakeEngine({
      socketPath: socketPath,
      usage: buildDiskUsageAnswer({
        volumes: [buildVolumeRecord({ name: 'cache-data', sizeBytes: 8192 })],
      }),
    });

    try {
      const findings = await loadEngineFindings({
        run: buildRun(),
        engineProbeId: 'orbStackEngine',
        engine: TEST_ENGINE,
      });

      expect(findings).toEqual({
        kind: 'succeeded',
        value: {
          findings: [
            {
              unit: {
                kind: 'engineVolume',
                ...buildFakeUnitPlace({
                  homeDir: environment.homeDir,
                  engineProbeId: 'orbStackEngine',
                }),
                sizeBytes: 8192,
                volumeName: buildVolumeName('cache-data'),
              },
              title: 'Docker Desktop volume cache-data',
              explanation:
                'A volume no container mounts, which keeps the data a container stored in it.',
              regeneration: 'Its data goes for good.',
              risk: 'careful',
              evidenceLines: ['No container mounts it.'],
              displayPath: join(environment.homeDir, 'disk.img'),
              activity: 'idle',
            },
          ],
          isComplete: true,
        },
      });
      expect(engine.requests).toEqual([
        'GET /_ping',
        'GET /version',
        `GET /v${FAKE_API_VERSION}/system/df`,
      ]);
    } finally {
      engine.stop();
    }
  });

  test('fails with the socket path when the engine answers an error status', async () => {
    const engine = startFakeEngine({
      socketPath: socketPath,
      usage: { message: 'broken' },
      diskUsageStatus: 500,
    });

    try {
      expect(
        await loadEngineFindings({
          run: buildRun(),
          engineProbeId: 'dockerDesktopEngine',
          engine: TEST_ENGINE,
        }),
      ).toEqual({
        kind: 'failed',
        failure: {
          kind: 'answerFailed',
          socketPath: socketPath,
          failure: { kind: 'requestFailed', endpoint: '/system/df', status: 500, code: null },
        },
      });
    } finally {
      engine.stop();
    }
  });

  test('fails with the socket path when the engine answers what its parsers do not read', async () => {
    const failing = startFakeEngine({ socketPath: socketPath, usage: null, versionAnswer: 'OK' });

    try {
      expect(
        await loadEngineFindings({
          run: buildRun(),
          engineProbeId: 'dockerDesktopEngine',
          engine: TEST_ENGINE,
        }),
      ).toEqual({
        kind: 'failed',
        failure: {
          kind: 'answerFailed',
          socketPath: socketPath,
          failure: { kind: 'badAnswer', endpoint: '/version' },
        },
      });
    } finally {
      failing.stop();
    }

    const refusing = startFakeEngine({ socketPath: socketPath, usage: { Images: 'none' } });

    try {
      expect(
        await loadEngineFindings({
          run: buildRun(),
          engineProbeId: 'dockerDesktopEngine',
          engine: TEST_ENGINE,
        }),
      ).toEqual({
        kind: 'failed',
        failure: {
          kind: 'answerFailed',
          socketPath: socketPath,
          failure: { kind: 'badAnswer', endpoint: '/system/df' },
        },
      });
    } finally {
      refusing.stop();
    }
  });

  test("judges the use of a build record by the scan's time, not the clock's", async () => {
    const scanEnvironment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });
    const engine = startFakeEngine({
      socketPath: socketPath,
      usage: buildDiskUsageAnswer({
        buildRecords: [buildBuildRecord({ digit: '2', lastUsedAtMs: NOW_MS - 2 * DAY_MS })],
      }),
    });

    try {
      expect(
        await loadEngineFindings({
          run: buildTestProbeRun({ environment: scanEnvironment }),
          engineProbeId: 'dockerDesktopEngine',
          engine: TEST_ENGINE,
        }),
      ).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: true } });
    } finally {
      engine.stop();
    }
  });

  describe("Colima's profiles", () => {
    const colima = CONTAINER_ENGINES.colimaEngine;

    function buildColimaPath(path: string): AbsolutePath {
      return joinBelowHome({ home: environment, path: `.colima/${path}` });
    }

    /** Serves a fake engine in the profile's folder with one unused volume named after it. */
    async function startProfileEngine(params: {
      folderName: string;
      usage?: unknown;
    }): Promise<FakeEngine> {
      await createFixtureDirectory({ path: buildColimaPath(params.folderName) });

      return startFakeEngine({
        socketPath: buildColimaPath(`${params.folderName}/docker.sock`),
        usage:
          params.usage ??
          buildDiskUsageAnswer({
            volumes: [buildVolumeRecord({ name: `${params.folderName}-data` })],
          }),
      });
    }

    /** The findings of an engine probe's answer; throws with its kind when the probe failed. */
    function getEngineFindings(result: ExploreProbeEngineResult): ExploreProbeFindings {
      if (result.kind === 'failed') {
        throw new Error(`The probe failed: ${result.failure.kind}.`);
      }

      return result.value;
    }

    /** Each volume unit's name, socket and disk image, in the order of the findings. */
    function listVolumePlaces(findings: ExploreProbeFindings): string[][] {
      return findings.findings.map((finding) =>
        finding.unit.kind === 'engineVolume'
          ? [finding.unit.volumeName, finding.unit.socketPath, finding.unit.diskImagePath]
          : [],
      );
    }

    test("asks each profile's socket with its own disk image, and skips Colima's own folders", async () => {
      const engines = [
        await startProfileEngine({ folderName: 'default' }),
        await startProfileEngine({ folderName: 'work' }),
        await startProfileEngine({ folderName: '_lima' }),
      ];

      try {
        await createFixtureDirectory({ path: buildColimaPath('stopped') });
        await writeFixtureTextFile({ path: buildColimaPath('ssh_config'), text: '' });

        const findings = getEngineFindings(
          await loadEngineFindings({
            run: buildRun(),
            engineProbeId: 'colimaEngine',
            engine: colima,
          }),
        );

        expect(listVolumePlaces(findings)).toEqual([
          [
            'default-data',
            buildColimaPath('default/docker.sock'),
            buildColimaPath('_lima/_disks/colima/datadisk'),
          ],
          [
            'work-data',
            buildColimaPath('work/docker.sock'),
            buildColimaPath('_lima/_disks/colima-work/datadisk'),
          ],
        ]);
        expect(findings.isComplete).toBe(true);
        expect(engines[2]?.requests).toEqual([]);
      } finally {
        for (const engine of engines) {
          engine.stop();
        }
      }
    });

    test('keeps the answers of the other profiles, incomplete, when one answers not as asked', async () => {
      const engines = [
        await startProfileEngine({ folderName: 'default', usage: { Images: 'none' } }),
        await startProfileEngine({ folderName: 'work' }),
      ];

      try {
        const findings = getEngineFindings(
          await loadEngineFindings({
            run: buildRun(),
            engineProbeId: 'colimaEngine',
            engine: colima,
          }),
        );

        expect(listVolumePlaces(findings).map(([volumeName]) => volumeName)).toEqual(['work-data']);
        expect(findings.isComplete).toBe(false);
      } finally {
        for (const engine of engines) {
          engine.stop();
        }
      }
    });

    test('answers socketMissing when no profile holds a socket, or Colima has no folder', async () => {
      function loadColima(): Promise<ExploreProbeEngineResult> {
        return loadEngineFindings({
          run: buildRun(),
          engineProbeId: 'colimaEngine',
          engine: colima,
        });
      }

      expect(await loadColima()).toEqual({ kind: 'failed', failure: { kind: 'socketMissing' } });

      await createFixtureDirectory({ path: buildColimaPath('default') });

      expect(await loadColima()).toEqual({ kind: 'failed', failure: { kind: 'socketMissing' } });
    });
  });

  test('removes a stopped container after reading it again, never with force', async () => {
    const engine = startFakeEngine({
      socketPath: socketPath,
      usage: buildDiskUsageAnswer({
        containers: [buildContainerRecord({ digit: '2', writableSizeBytes: 300 })],
      }),
      answerRequest: () => ({ status: 204, bodyText: '' }),
    });

    try {
      const call = await callEngineUnit({
        unit: { kind: 'engineContainer', ...buildPlace(300), containerId: buildContainerId('2') },
        user: environment.user,
        timeoutMs: TIMEOUT_MS,
      });

      expect(call).toEqual({ outcome: 'removed', freedBytes: 300, status: 204 });
      expect(engine.requests).toEqual([
        'GET /_ping',
        'GET /version',
        `GET /v${FAKE_API_VERSION}/system/df?type=container`,
        `DELETE /v${FAKE_API_VERSION}/containers/${buildContainerId('2')}`,
      ]);
    } finally {
      engine.stop();
    }
  });

  test('keeps a unit the engine refuses as in use, and one already gone as such', async () => {
    const statuses = [
      { status: 409, outcome: 'engineInUse' },
      { status: 404, outcome: 'alreadyGone' },
    ] as const;

    for (const answer of statuses) {
      const engine = startFakeEngine({
        socketPath: socketPath,
        usage: buildDiskUsageAnswer({ volumes: [buildVolumeRecord({ name: 'db' })] }),
        answerRequest: () => ({
          status: answer.status,
          bodyText: JSON.stringify({ message: 'no' }),
        }),
      });

      try {
        expect(
          await callEngineUnit({
            unit: { kind: 'engineVolume', ...buildPlace(4096), volumeName: buildVolumeName('db') },
            user: environment.user,
            timeoutMs: TIMEOUT_MS,
          }),
        ).toEqual({ outcome: answer.outcome, freedBytes: 0, status: answer.status });
        expect(engine.requests.slice(3)).toEqual([`DELETE /v${FAKE_API_VERSION}/volumes/db`]);
      } finally {
        engine.stop();
      }
    }
  });

  test('fails with the status of an answer that is neither a success nor a refusal', async () => {
    const engine = startFakeEngine({
      socketPath: socketPath,
      usage: buildDiskUsageAnswer({ volumes: [buildVolumeRecord({ name: 'db' })] }),
      answerRequest: () => ({ status: 500, bodyText: JSON.stringify({ message: 'broken' }) }),
    });

    try {
      expect(
        await callEngineUnit({
          unit: { kind: 'engineVolume', ...buildPlace(4096), volumeName: buildVolumeName('db') },
          user: environment.user,
          timeoutMs: TIMEOUT_MS,
        }),
      ).toEqual({ outcome: 'failed', freedBytes: 0, status: 500, code: 'HTTP 500' });
    } finally {
      engine.stop();
    }
  });

  test('sends no removal for a unit that changed since the scan', async () => {
    const engine = startFakeEngine({
      socketPath: socketPath,
      usage: buildDiskUsageAnswer({
        containers: [buildContainerRecord({ digit: '2', state: 'running' })],
      }),
      answerRequest: () => ({ status: 204, bodyText: '' }),
    });

    try {
      expect(
        await callEngineUnit({
          unit: { kind: 'engineContainer', ...buildPlace(0), containerId: buildContainerId('2') },
          user: environment.user,
          timeoutMs: TIMEOUT_MS,
        }),
      ).toEqual({ outcome: 'changedSinceScan', freedBytes: 0 });
      expect(engine.requests.filter((request) => request.startsWith('DELETE'))).toEqual([]);
    } finally {
      engine.stop();
    }
  });

  test('answers engineNotRunning when the socket is gone, and changedSinceScan when it is no socket', async () => {
    const unit: ExploreEngineUnit = {
      kind: 'engineContainer',
      ...buildPlace(0),
      containerId: buildContainerId('2'),
    };

    expect(
      await callEngineUnit({ unit: unit, user: environment.user, timeoutMs: TIMEOUT_MS }),
    ).toEqual({ outcome: 'engineNotRunning', freedBytes: 0 });

    await writeFixtureTextFile({ path: socketPath, text: 'not a socket' });

    expect(
      await callEngineUnit({ unit: unit, user: environment.user, timeoutMs: TIMEOUT_MS }),
    ).toEqual({ outcome: 'changedSinceScan', freedBytes: 0 });
  });

  test('prunes each build record by its id and counts the space the engine reports', async () => {
    const recordIds = [buildBuildRecordId('1'), buildBuildRecordId('2')];
    const engine = startFakeEngine({
      socketPath: socketPath,
      usage: buildDiskUsageAnswer({
        buildRecords: [buildBuildRecord({ digit: '1' }), buildBuildRecord({ digit: '2' })],
      }),
      answerRequest: (request) => {
        const recordId = recordIds.find((id) => request.path.includes(id));

        return {
          status: 200,
          bodyText: JSON.stringify({
            CachesDeleted: recordId === recordIds[0] ? [recordId] : null,
            SpaceReclaimed: recordId === recordIds[0] ? 1234 : 0,
          }),
        };
      },
    });

    try {
      const call = await callEngineUnit({
        unit: { kind: 'engineBuildCache', ...buildPlace(4096), recordIds: recordIds },
        user: environment.user,
        timeoutMs: TIMEOUT_MS,
      });

      expect(call).toEqual({ outcome: 'engineInUse', freedBytes: 1234, status: 200 });
      expect(engine.requests.slice(3)).toEqual(
        recordIds.map(
          (recordId) =>
            `POST /v${FAKE_API_VERSION}/build/prune?all=true&filters={"id":["${recordId}"]}`,
        ),
      );
    } finally {
      engine.stop();
    }
  });

  test('removes the untagged images one by one and keeps the unit when one is refused', async () => {
    const imageIds = [buildImageId('1'), buildImageId('2')];
    const engine = startFakeEngine({
      socketPath: socketPath,
      usage: buildDiskUsageAnswer({
        images: [
          buildImageRecord({ digit: '1', sizeBytes: 700 }),
          buildImageRecord({ digit: '2', sizeBytes: 500 }),
        ],
      }),
      answerRequest: (request) =>
        request.path.endsWith(imageIds[0] ?? '')
          ? { status: 200, bodyText: JSON.stringify([{ Deleted: imageIds[0] }]) }
          : {
              status: 409,
              bodyText: JSON.stringify({ message: 'image has dependent child images' }),
            },
    });

    try {
      expect(
        await callEngineUnit({
          unit: { kind: 'engineDanglingImages', ...buildPlace(1200), imageIds: imageIds },
          user: environment.user,
          timeoutMs: TIMEOUT_MS,
        }),
      ).toEqual({ outcome: 'engineInUse', freedBytes: 700, status: 409 });
      expect(engine.requests.slice(3)).toEqual(
        imageIds.map((imageId) => `DELETE /v${FAKE_API_VERSION}/images/${imageId}`),
      );
    } finally {
      engine.stop();
    }
  });
});
