import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { EXPLORE_PROBE_DEADLINE_GRACE_MS } from '../../src/explore/limits.js';
import type { ProjectPins } from '../../src/explore/projectPins/projectPins.js';
import { runExploreProbe, startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  isPresent,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { writeDartVersionFile } from '../support/flutterSdkFixtures.js';
import { buildFixtureToolLocations, createProbeFakeTool } from './probeFakeTools.js';
import {
  buildDartGcDryRunText,
  buildDartGcPaths,
  buildMisePrunableJson,
  buildSimulatorDeviceListJson,
} from './probeOutputFixtures.js';
import {
  buildEmptyProjectPinsLoad,
  buildSettledProjectPinsLoad,
  buildTestPinFileText,
  buildTestProjectPins,
} from './projectPinsFixtures.js';

const TIMEOUT_MS = 10_000;

/** No probe these tests check judges its units by their last use. */
const UNUSED_CUTOFF_MS = 0;

/** Long enough for a probe that does not wait to have run its tool. */
const HELD_WAIT_MS = 300;

/** A made-up bundle path of an active Xcode. */
const ACTIVE_XCODE_BUNDLE_PATH = '/Applications/Xcode.app';

let fixtureRoot: FixtureRoot;
let environment: Environment;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

/**
 * Each tool touches its marker in the fixture root before it answers. The dart stands in an SDK
 * of 3.11, the first that has `pub cache gc`.
 */
async function createWorkingTools(): Promise<{ xcrun: string; dart: string; mise: string }> {
  const folder = join(fixtureRoot.rootDir, 'tools');
  const homeDir = environment.homeDir;
  const dart = await createProbeFakeTool({
    folder: join(fixtureRoot.rootDir, 'dart-sdk', 'bin'),
    name: 'dart',
    answers: [
      {
        command: 'dartPubCache',
        stdoutText: buildDartGcDryRunText({
          homeDir: homeDir,
          gcPaths: buildDartGcPaths({ homeDir: homeDir }),
        }),
        exitCode: 0,
      },
    ],
    prelude: `touch '${buildMarkerPath({ name: 'dart' })}'`,
  });

  await writeDartVersionFile({ dartPath: dart, version: '3.11.0' });

  return {
    xcrun: await createProbeFakeTool({
      folder: folder,
      name: 'xcrun',
      answers: [
        {
          command: 'simulatorDevices',
          stdoutText: buildSimulatorDeviceListJson({ homeDir: homeDir }),
          exitCode: 0,
        },
      ],
      prelude: `touch '${buildMarkerPath({ name: 'xcrun' })}'`,
    }),
    dart: dart,
    mise: await createProbeFakeTool({
      folder: folder,
      name: 'mise',
      answers: [
        {
          command: 'miseVersions',
          stdoutText: buildMisePrunableJson({ homeDir: homeDir }),
          exitCode: 0,
        },
      ],
      prelude: `touch '${buildMarkerPath({ name: 'mise' })}'`,
    }),
  };
}

function buildMarkerPath(params: { name: string }): string {
  return join(fixtureRoot.rootDir, `${params.name}.ran`);
}

describe('startExploreProbes', () => {
  test('finds the units of every tool with the activity of each, all judged', async () => {
    const tools = await createWorkingTools();

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations(tools),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: UNUSED_CUTOFF_MS,
    });

    const simulatorDevices = await probes.simulatorDevices;
    const dartPubCache = await probes.dartPubCache;
    const miseVersions = await probes.miseVersions;

    if (
      simulatorDevices.kind !== 'probed' ||
      dartPubCache.kind !== 'probed' ||
      miseVersions.kind !== 'probed'
    ) {
      throw new Error('Every probe should have run.');
    }

    expect(simulatorDevices.findings.map((finding) => finding.activity)).toEqual(['idle', 'busy']);
    expect(simulatorDevices.findings[0]?.unit).toMatchObject({
      tool: { name: 'xcrun', path: await realpath(tools.xcrun) },
    });
    expect(dartPubCache.findings).toHaveLength(1);
    expect(miseVersions.findings.map((finding) => finding.title)).toEqual([
      'mise node 20.1.0',
      'mise pnpm 9.0.0',
    ]);
    expect(
      [simulatorDevices, dartPubCache, miseVersions].map((outcome) => outcome.isComplete),
    ).toEqual([true, true, true]);
  });

  test('leaves simulator devices unknown, but Dart and mise idle, when ps failed', async () => {
    const tools = await createWorkingTools();

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations(tools),
      processCommands: Promise.resolve(null),
      activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: UNUSED_CUTOFF_MS,
    });

    const outcomes = [
      await probes.simulatorDevices,
      await probes.dartPubCache,
      await probes.miseVersions,
    ];
    const activities = outcomes.map((outcome) =>
      outcome.kind === 'probed' ? outcome.findings.map((finding) => finding.activity) : null,
    );

    expect(activities).toEqual([['unknown', 'busy'], ['idle'], ['idle', 'idle']]);
  });

  test('runs no tool before the processes are read', async () => {
    const tools = await createWorkingTools();
    const processCommands = Promise.withResolvers<string[] | null>();

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations(tools),
      processCommands: processCommands.promise,
      activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: UNUSED_CUTOFF_MS,
    });

    await Bun.sleep(HELD_WAIT_MS);

    for (const name of ['xcrun', 'dart', 'mise']) {
      expect(await isPresent(buildMarkerPath({ name: name }))).toBe(false);
    }

    processCommands.resolve([]);

    expect((await probes.simulatorDevices).kind).toBe('probed');
    expect((await probes.dartPubCache).kind).toBe('probed');
    expect((await probes.miseVersions).kind).toBe('probed');
    expect(await isPresent(buildMarkerPath({ name: 'xcrun' }))).toBe(true);
  });

  test('answers toolMissing for the simulators without an active Xcode and runs no xcrun', async () => {
    const tools = await createWorkingTools();

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations(tools),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(null),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: UNUSED_CUTOFF_MS,
    });

    expect(await probes.simulatorDevices).toEqual({ kind: 'toolMissing' });
    expect(await probes.simulatorRuntimes).toEqual({ kind: 'toolMissing' });
    expect((await probes.dartPubCache).kind).toBe('probed');
    expect((await probes.miseVersions).kind).toBe('probed');
    expect(await isPresent(buildMarkerPath({ name: 'xcrun' }))).toBe(false);
  });

  test('fails a probe that exits non-zero, with its exit code and stderr', async () => {
    const xcrun = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'xcrun',
      answers: [
        {
          command: 'simulatorDevices',
          stdoutText: buildSimulatorDeviceListJson({ homeDir: environment.homeDir }),
          exitCode: 3,
        },
      ],
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ xcrun: xcrun }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: UNUSED_CUTOFF_MS,
    });

    expect(await probes.simulatorDevices).toEqual({
      kind: 'failed',
      tool: { name: 'xcrun', path: await realpath(xcrun) },
      failure: {
        reason: 'commandFailed',
        failure: { reason: 'exitedWithError', exitCode: 3, stderrTail: 'a line on stderr\n' },
      },
    });
  });

  test('fails a probe whose output its parser rejects', async () => {
    const mise = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'mise',
      answers: [{ command: 'miseVersions', stdoutText: 'garbage', exitCode: 0 }],
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ mise: mise }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: UNUSED_CUTOFF_MS,
    });

    const outcome = await probes.miseVersions;

    expect(outcome.kind === 'failed' && outcome.failure.reason).toBe('outputUnreadable');
  });

  test('names an untrusted tool and runs no probe with it', async () => {
    const dart = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'dart',
      answers: [{ command: 'dartPubCache', stdoutText: 'garbage', exitCode: 0 }],
      mode: 0o775,
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ dart: dart }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: UNUSED_CUTOFF_MS,
    });

    expect(await probes.dartPubCache).toEqual({
      kind: 'toolUntrusted',
      failure: { reason: 'untrusted', path: await realpath(dart), detail: 'writableByOthers' },
    });
  });

  test('answers toolMissing for a tool at none of its locations', async () => {
    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({
        xcrun: join(fixtureRoot.rootDir, 'absent', 'xcrun'),
      }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: UNUSED_CUTOFF_MS,
    });

    expect(await probes.simulatorDevices).toEqual({ kind: 'toolMissing' });
    expect(await probes.dartPubCache).toEqual({ kind: 'toolMissing' });
    expect(await probes.miseVersions).toEqual({ kind: 'toolMissing' });
    expect(await probes.androidAvds).toEqual({ kind: 'toolMissing' });
    expect(await probes.homebrewAppleSilicon).toEqual({ kind: 'toolMissing' });
    expect(await probes.homebrewIntel).toEqual({ kind: 'toolMissing' });
  });

  test('answers timedOut for a files probe still reading at its deadline', async () => {
    const outcome = await runExploreProbe({
      probe: { kind: 'files', loadFindings: () => new Promise(() => {}) },
      start: {
        environment: environment,
        toolInstallLocations: buildFixtureToolLocations({}),
        processCommands: Promise.resolve([]),
        activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
        projectPins: buildEmptyProjectPinsLoad(),
        timeoutMs: 50,
        unusedCutoffMs: UNUSED_CUTOFF_MS,
      },
    });

    expect(outcome).toEqual({ kind: 'timedOut' });
  });

  test('starts the limit of a pinned probe once the walk ended', async () => {
    const timeoutMs = 50;
    const walkEnded = new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs + EXPLORE_PROBE_DEADLINE_GRACE_MS + 200);
    });
    const pinnedProjectPins = buildTestProjectPins({
      files: [buildTestPinFileText({ path: '/work/app/.nvmrc', kind: 'nvmrc', text: '22\n' })],
    });
    const builtProjectPins: ProjectPins[] = [];

    const outcome = await runExploreProbe({
      probe: {
        kind: 'pinned',
        buildProbe: (params) => {
          builtProjectPins.push(params.projectPins);

          return {
            kind: 'files',
            loadFindings: () =>
              Promise.resolve({ kind: 'succeeded', value: { findings: [], isComplete: true } }),
          };
        },
      },
      start: {
        environment: environment,
        toolInstallLocations: buildFixtureToolLocations({}),
        processCommands: Promise.resolve([]),
        activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
        projectPins: {
          walkEnded: walkEnded,
          pins: walkEnded.then(() => ({ kind: 'succeeded', value: pinnedProjectPins })),
        },
        timeoutMs: timeoutMs,
        unusedCutoffMs: UNUSED_CUTOFF_MS,
      },
    });

    expect(outcome).toEqual({ kind: 'probed', findings: [], isComplete: true });
    expect(builtProjectPins).toEqual([pinnedProjectPins]);
  });

  test('answers unreadable at the path of pins that failed, and builds no probe', async () => {
    let isProbeBuilt = false;

    const outcome = await runExploreProbe({
      probe: {
        kind: 'pinned',
        buildProbe: () => {
          isProbeBuilt = true;

          return { kind: 'files', loadFindings: () => new Promise(() => {}) };
        },
      },
      start: {
        environment: environment,
        toolInstallLocations: buildFixtureToolLocations({}),
        processCommands: Promise.resolve([]),
        activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
        projectPins: buildSettledProjectPinsLoad({
          pins: {
            kind: 'failed',
            failure: {
              reason: 'fileUnreadable',
              path: '/tracked-configs/link',
              failure: { reason: 'permissionDenied', code: 'EACCES' },
            },
          },
        }),
        timeoutMs: TIMEOUT_MS,
        unusedCutoffMs: UNUSED_CUTOFF_MS,
      },
    });

    expect(outcome).toEqual({
      kind: 'unreadable',
      path: '/tracked-configs/link',
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });
    expect(isProbeBuilt).toBe(false);
  });

  test('answers timedOut for a pinned probe whose pins never settle', async () => {
    const outcome = await runExploreProbe({
      probe: {
        kind: 'pinned',
        buildProbe: () => ({
          kind: 'files',
          loadFindings: () =>
            Promise.resolve({ kind: 'succeeded', value: { findings: [], isComplete: true } }),
        }),
      },
      start: {
        environment: environment,
        toolInstallLocations: buildFixtureToolLocations({}),
        processCommands: Promise.resolve([]),
        activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
        projectPins: { walkEnded: Promise.resolve(), pins: new Promise(() => {}) },
        timeoutMs: 50,
        unusedCutoffMs: UNUSED_CUTOFF_MS,
      },
    });

    expect(outcome).toEqual({ kind: 'timedOut' });
  });

  test('fails a probe whose command passes its limit, naming its tool rather than timedOut', async () => {
    const mise = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'mise',
      answers: [{ command: 'miseVersions', stdoutText: '', exitCode: 0 }],
      prelude: 'sleep 5',
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ mise: mise }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(ACTIVE_XCODE_BUNDLE_PATH),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: 100,
      unusedCutoffMs: UNUSED_CUTOFF_MS,
    });

    expect(await probes.miseVersions).toEqual({
      kind: 'failed',
      tool: { name: 'mise', path: await realpath(mise) },
      failure: {
        reason: 'commandFailed',
        failure: { reason: 'timedOut', timeoutMs: expect.any(Number), stderrTail: '' },
      },
    });
  });
});
