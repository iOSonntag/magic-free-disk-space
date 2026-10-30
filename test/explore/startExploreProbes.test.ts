import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { buildFixtureToolLocations, createProbeFakeTool } from './probeFakeTools.js';
import {
  buildDartGcDryRunText,
  buildDartGcPaths,
  buildMisePrunableJson,
  buildSimulatorDeviceListJson,
} from './probeOutputFixtures.js';

const TIMEOUT_MS = 10_000;

let fixtureRoot: FixtureRoot;
let environment: Environment;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function createWorkingTools(): Promise<{ xcrun: string; dart: string; mise: string }> {
  const folder = join(fixtureRoot.rootDir, 'tools');
  const homeDir = environment.homeDir;

  return {
    xcrun: await createProbeFakeTool({
      folder: folder,
      name: 'xcrun',
      stdoutText: buildSimulatorDeviceListJson({ homeDir: homeDir }),
      exitCode: 0,
    }),
    dart: await createProbeFakeTool({
      folder: folder,
      name: 'dart',
      stdoutText: buildDartGcDryRunText({
        homeDir: homeDir,
        gcPaths: buildDartGcPaths({ homeDir: homeDir }),
      }),
      exitCode: 0,
    }),
    mise: await createProbeFakeTool({
      folder: folder,
      name: 'mise',
      stdoutText: buildMisePrunableJson({ homeDir: homeDir }),
      exitCode: 0,
    }),
  };
}

describe('startExploreProbes', () => {
  test('finds the units of every tool with the activity of each', async () => {
    const tools = await createWorkingTools();

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations(tools),
      processCommands: Promise.resolve([]),
      timeoutMs: TIMEOUT_MS,
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

    expect(simulatorDevices.findings.map((finding) => finding.activity)).toEqual([
      'idle',
      'idle',
      'busy',
    ]);
    expect(simulatorDevices.findings[0]?.unit.tool).toEqual({
      name: 'xcrun',
      path: await realpath(tools.xcrun),
    });
    expect(dartPubCache.findings).toHaveLength(1);
    expect(miseVersions.findings.map((finding) => finding.title)).toEqual([
      'mise node 20.1.0',
      'mise pnpm 9.0.0',
    ]);
  });

  test('leaves simulator devices unknown, but Dart and mise idle, when ps failed', async () => {
    const tools = await createWorkingTools();

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations(tools),
      processCommands: Promise.resolve(null),
      timeoutMs: TIMEOUT_MS,
    });

    const outcomes = [
      await probes.simulatorDevices,
      await probes.dartPubCache,
      await probes.miseVersions,
    ];
    const activities = outcomes.map((outcome) =>
      outcome.kind === 'probed' ? outcome.findings.map((finding) => finding.activity) : null,
    );

    expect(activities).toEqual([['unknown', 'unknown', 'busy'], ['idle'], ['idle', 'idle']]);
  });

  test('fails a probe that exits non-zero, with its exit code and stderr', async () => {
    const xcrun = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'xcrun',
      stdoutText: buildSimulatorDeviceListJson({ homeDir: environment.homeDir }),
      exitCode: 3,
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ xcrun: xcrun, dart: null, mise: null }),
      processCommands: Promise.resolve([]),
      timeoutMs: TIMEOUT_MS,
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
      stdoutText: 'garbage',
      exitCode: 0,
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ xcrun: null, dart: null, mise: mise }),
      processCommands: Promise.resolve([]),
      timeoutMs: TIMEOUT_MS,
    });

    const outcome = await probes.miseVersions;

    expect(outcome.kind === 'failed' && outcome.failure.reason).toBe('outputUnreadable');
  });

  test('names an untrusted tool and runs no probe with it', async () => {
    const dart = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'dart',
      stdoutText: 'garbage',
      exitCode: 0,
      mode: 0o775,
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ xcrun: null, dart: dart, mise: null }),
      processCommands: Promise.resolve([]),
      timeoutMs: TIMEOUT_MS,
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
        dart: null,
        mise: null,
      }),
      processCommands: Promise.resolve([]),
      timeoutMs: TIMEOUT_MS,
    });

    expect(await probes.simulatorDevices).toEqual({ kind: 'toolMissing' });
    expect(await probes.dartPubCache).toEqual({ kind: 'toolMissing' });
    expect(await probes.miseVersions).toEqual({ kind: 'toolMissing' });
  });
});
