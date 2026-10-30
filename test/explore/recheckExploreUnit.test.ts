import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type {
  ExploreToolUnitDartPubCache,
  ExploreToolUnitMiseVersion,
  ExploreToolUnitSimulatorDevice,
} from '../../src/explore/exploreUnit.js';
import {
  compareDartPubCache,
  compareMiseVersion,
  compareSimulatorDevice,
  recheckExploreUnit,
} from '../../src/explore/recheckExploreUnit.js';
import type { SimulatorDevice } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestMiseToolName,
  buildTestMiseToolVersion,
} from '../support/parsedValueFixtures.js';
import type { ProbeCommandName } from './probeFakeTools.js';
import { createProbeFakeTool } from './probeFakeTools.js';
import {
  buildDartGcDryRunText,
  buildDartGcPaths,
  buildDeviceDataPath,
  buildMiseInstallPath,
  buildMisePrunableJson,
  buildSimulatorDeviceListJson,
  FIXTURE_HOME_DIR,
  UNAVAILABLE_DEVICE_UDID,
  USED_DEVICE_UDID,
} from './probeOutputFixtures.js';

const TIMEOUT_MS = 10_000;

/** The one probe command each tool of these tests answers. */
const PROBE_COMMANDS: Record<'xcrun' | 'dart' | 'mise', ProbeCommandName> = {
  xcrun: 'simulatorDevices',
  dart: 'dartPubCache',
  mise: 'miseVersions',
};

const SIMULATOR_APP_COMMAND =
  '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator';

const xcrun: LocatedTool = { name: 'xcrun', path: '/usr/bin/xcrun' };

const unavailableDevice: SimulatorDevice = {
  udid: UNAVAILABLE_DEVICE_UDID,
  name: 'iPhone 15',
  runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
  state: 'Shutdown',
  isAvailable: false,
  availabilityError: null,
  dataPath: buildDeviceDataPath({ homeDir: FIXTURE_HOME_DIR, udid: UNAVAILABLE_DEVICE_UDID }),
};

const deviceUnit: ExploreToolUnitSimulatorDevice = {
  kind: 'simulatorDevice',
  tool: xcrun,
  udid: UNAVAILABLE_DEVICE_UDID,
  dataPath: unavailableDevice.dataPath,
};

const gcPaths = buildDartGcPaths({ homeDir: FIXTURE_HOME_DIR });

const dartUnit: ExploreToolUnitDartPubCache = {
  kind: 'dartPubCache',
  tool: { name: 'dart', path: '/opt/example/dart' },
  gcPaths: gcPaths,
};

const nodeInstallPath = buildMiseInstallPath({
  homeDir: FIXTURE_HOME_DIR,
  miseToolName: 'node',
  version: '20.1.0',
});

const nodeMiseToolName = buildTestMiseToolName({ text: 'node' });

const nodeVersion = buildTestMiseToolVersion({ text: '20.1.0' });

const miseUnit: ExploreToolUnitMiseVersion = {
  kind: 'miseVersion',
  tool: { name: 'mise', path: '/opt/example/mise' },
  miseToolName: nodeMiseToolName,
  version: nodeVersion,
  installPath: nodeInstallPath,
};

describe('compareSimulatorDevice', () => {
  test('is unchanged while the device is still listed and offered', () => {
    expect(
      compareSimulatorDevice({
        unit: deviceUnit,
        devices: [unavailableDevice],
        processCommands: [],
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed when the device is gone, moved, or no longer offered', () => {
    for (const devices of [
      [],
      [
        {
          ...unavailableDevice,
          dataPath: buildTestAbsolutePath({ text: '/Users/example/elsewhere/data' }),
        },
      ],
      [{ ...unavailableDevice, isAvailable: true }],
    ]) {
      expect(
        compareSimulatorDevice({ unit: deviceUnit, devices: devices, processCommands: [] }),
      ).toEqual({ kind: 'changed' });
    }
  });

  test('is busy when the device booted, Simulator.app runs, or ps failed', () => {
    expect(
      compareSimulatorDevice({
        unit: deviceUnit,
        devices: [{ ...unavailableDevice, state: 'Booted' }],
        processCommands: [],
      }),
    ).toEqual({ kind: 'busy' });
    expect(
      compareSimulatorDevice({
        unit: deviceUnit,
        devices: [unavailableDevice],
        processCommands: [SIMULATOR_APP_COMMAND],
      }),
    ).toEqual({ kind: 'busy' });
    expect(
      compareSimulatorDevice({
        unit: deviceUnit,
        devices: [unavailableDevice],
        processCommands: null,
      }),
    ).toEqual({ kind: 'busy' });
  });
});

describe('compareDartPubCache', () => {
  test('is unchanged for the same set or a subset, even when ps failed', () => {
    expect(
      compareDartPubCache({ unit: dartUnit, gcPaths: gcPaths, processCommands: null }),
    ).toEqual({ kind: 'unchanged' });
    expect(
      compareDartPubCache({ unit: dartUnit, gcPaths: gcPaths.slice(1), processCommands: [] }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed for an empty set or a path the scan did not list', () => {
    expect(compareDartPubCache({ unit: dartUnit, gcPaths: [], processCommands: [] })).toEqual({
      kind: 'changed',
    });
    expect(
      compareDartPubCache({
        unit: dartUnit,
        gcPaths: [
          ...gcPaths,
          buildTestAbsolutePath({
            text: '/Users/example/.pub-cache/hosted/pub.dev/example_d-1.0.0',
          }),
        ],
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
  });
});

describe('compareMiseVersion', () => {
  test('is unchanged while the version is still prunable at the same path, even when ps failed', () => {
    expect(
      compareMiseVersion({
        unit: miseUnit,
        versions: [
          { miseToolName: nodeMiseToolName, version: nodeVersion, installPath: nodeInstallPath },
        ],
        processCommands: null,
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed when the version is no longer prunable or moved', () => {
    for (const versions of [
      [],
      [
        {
          miseToolName: nodeMiseToolName,
          version: nodeVersion,
          installPath: buildTestAbsolutePath({ text: '/Users/example/elsewhere' }),
        },
      ],
      [
        {
          miseToolName: nodeMiseToolName,
          version: buildTestMiseToolVersion({ text: '20.2.0' }),
          installPath: nodeInstallPath,
        },
      ],
    ]) {
      expect(
        compareMiseVersion({ unit: miseUnit, versions: versions, processCommands: [] }),
      ).toEqual({ kind: 'changed' });
    }
  });
});

describe('recheckExploreUnit', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  async function createTool(params: {
    name: 'xcrun' | 'dart' | 'mise';
    stdoutText: string;
    exitCode: number;
  }): Promise<LocatedTool> {
    const path = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: params.name,
      answers: [
        {
          command: PROBE_COMMANDS[params.name],
          stdoutText: params.stdoutText,
          exitCode: params.exitCode,
        },
      ],
    });

    return { name: params.name, path: await realpath(path) };
  }

  test('runs the simulator probe again with the given tool', async () => {
    const tool = await createTool({
      name: 'xcrun',
      stdoutText: buildSimulatorDeviceListJson({ homeDir: environment.homeDir }),
      exitCode: 0,
    });
    const unit: ExploreToolUnitSimulatorDevice = {
      kind: 'simulatorDevice',
      tool: tool,
      udid: UNAVAILABLE_DEVICE_UDID,
      dataPath: buildDeviceDataPath({
        homeDir: environment.homeDir,
        udid: UNAVAILABLE_DEVICE_UDID,
      }),
    };
    const usedUnit: ExploreToolUnitSimulatorDevice = {
      ...unit,
      udid: USED_DEVICE_UDID,
      dataPath: buildDeviceDataPath({ homeDir: environment.homeDir, udid: USED_DEVICE_UDID }),
    };

    const recheck = {
      tool: tool,
      environment: environment,
      processCommands: [],
      timeoutMs: TIMEOUT_MS,
    };

    expect(await recheckExploreUnit({ ...recheck, unit: unit })).toEqual({ kind: 'unchanged' });
    expect(await recheckExploreUnit({ ...recheck, unit: usedUnit })).toEqual({ kind: 'changed' });
    expect(await recheckExploreUnit({ ...recheck, unit: unit, processCommands: null })).toEqual({
      kind: 'busy',
    });
  });

  test('runs the Dart and mise probes again', async () => {
    const homeDir = environment.homeDir;
    const fixtureGcPaths = buildDartGcPaths({ homeDir: homeDir });
    const dart = await createTool({
      name: 'dart',
      stdoutText: buildDartGcDryRunText({ homeDir: homeDir, gcPaths: fixtureGcPaths }),
      exitCode: 0,
    });
    const mise = await createTool({
      name: 'mise',
      stdoutText: buildMisePrunableJson({ homeDir: homeDir }),
      exitCode: 0,
    });

    expect(
      await recheckExploreUnit({
        unit: { kind: 'dartPubCache', tool: dart, gcPaths: fixtureGcPaths },
        tool: dart,
        environment: environment,
        processCommands: null,
        timeoutMs: TIMEOUT_MS,
      }),
    ).toEqual({ kind: 'unchanged' });
    expect(
      await recheckExploreUnit({
        unit: {
          kind: 'miseVersion',
          tool: mise,
          miseToolName: nodeMiseToolName,
          version: nodeVersion,
          installPath: buildMiseInstallPath({
            homeDir: homeDir,
            miseToolName: 'node',
            version: '20.1.0',
          }),
        },
        tool: mise,
        environment: environment,
        processCommands: null,
        timeoutMs: TIMEOUT_MS,
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('fails when the probe fails or prints garbage', async () => {
    const failing = await createTool({ name: 'mise', stdoutText: '{}', exitCode: 1 });
    const unit: ExploreToolUnitMiseVersion = { ...miseUnit, tool: failing };

    expect(
      await recheckExploreUnit({
        unit: unit,
        tool: failing,
        environment: environment,
        processCommands: [],
        timeoutMs: TIMEOUT_MS,
      }),
    ).toEqual({
      kind: 'failed',
      failure: {
        reason: 'commandFailed',
        failure: { reason: 'exitedWithError', exitCode: 1, stderrTail: 'a line on stderr\n' },
      },
    });

    const garbled = await createTool({ name: 'xcrun', stdoutText: 'garbage', exitCode: 0 });
    const recheck = await recheckExploreUnit({
      unit: { ...deviceUnit, tool: garbled },
      tool: garbled,
      environment: environment,
      processCommands: [],
      timeoutMs: TIMEOUT_MS,
    });

    expect(recheck.kind === 'failed' && recheck.failure.reason).toBe('outputUnreadable');
  });
});
