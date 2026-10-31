import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreToolUnitSimulatorRuntime } from '../../src/explore/exploreUnit.js';
import { recheckExploreUnit } from '../../src/explore/recheckExploreUnit.js';
import type { SimulatorDevice } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import { parseSimulatorDeviceList } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import { buildSimulatorRuntimeFindings } from '../../src/explore/simulatorRuntimes/buildSimulatorRuntimeFindings.js';
import { loadSimulatorRuntimeFindings } from '../../src/explore/simulatorRuntimes/loadSimulatorRuntimeFindings.js';
import type { SimulatorRuntimeState } from '../../src/explore/simulatorRuntimes/loadSimulatorRuntimeState.js';
import { parseSimulatorRuntimeList } from '../../src/explore/simulatorRuntimes/parseSimulatorRuntimeList.js';
import { compareSimulatorRuntime } from '../../src/explore/simulatorRuntimes/recheckSimulatorRuntimeUnit.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import type { ProbeFakeAnswer } from './probeFakeTools.js';
import { buildFixtureToolLocations, createProbeFakeTool } from './probeFakeTools.js';
import {
  AVAILABLE_UNDATED_DEVICE_UDID,
  buildSimulatorDeviceListJson,
  FIXTURE_HOME_DIR,
} from './probeOutputFixtures.js';
import { buildEmptyProjectPinsLoad } from './projectPinsFixtures.js';
import {
  buildRuntimeEntry,
  buildRuntimeImagePath,
  buildSimulatorRuntimeListJson,
  DEVICE_RUNTIME_ID,
  OFFERED_RUNTIME_ID,
  OFFERED_RUNTIME_IDENTIFIER,
  OFFERED_RUNTIME_LAST_USED_AT_MS,
  RECENT_RUNTIME_ID,
  RUNTIME_UNUSED_CUTOFF_MS,
  UNDATED_RUNTIME_ID,
  UNDELETABLE_RUNTIME_ID,
} from './simulatorRuntimeFixtures.js';

const TIMEOUT_MS = 10_000;

const SIMULATOR_APP_COMMAND =
  '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator';

const tool: LocatedTool = { name: 'xcrun', path: '/usr/bin/xcrun' };

function parseFixtureState(): SimulatorRuntimeState {
  const runtimes = parseSimulatorRuntimeList({ stdoutText: buildSimulatorRuntimeListJson() });
  const devices = parseSimulatorDeviceList({
    stdoutText: buildSimulatorDeviceListJson({ homeDir: FIXTURE_HOME_DIR }),
  });

  if (runtimes.kind === 'failed' || devices.kind === 'failed') {
    throw new Error('The fixtures did not parse.');
  }

  return { runtimes: runtimes.value, devices: devices.value };
}

function buildOfferedUnit(params: { tool: LocatedTool }): ExploreToolUnitSimulatorRuntime {
  return {
    kind: 'simulatorRuntime',
    tool: params.tool,
    runtimeId: OFFERED_RUNTIME_ID,
    runtimeIdentifier: OFFERED_RUNTIME_IDENTIFIER,
    imagePath: buildRuntimeImagePath({ runtimeId: OFFERED_RUNTIME_ID }),
    lastUsedAtMs: OFFERED_RUNTIME_LAST_USED_AT_MS,
  };
}

function buildWorkingAnswers(params: { homeDir: string }): ProbeFakeAnswer[] {
  return [
    { command: 'simulatorRuntimes', stdoutText: buildSimulatorRuntimeListJson(), exitCode: 0 },
    {
      command: 'simulatorDevices',
      stdoutText: buildSimulatorDeviceListJson({ homeDir: params.homeDir }),
      exitCode: 0,
    },
  ];
}

describe('parseSimulatorRuntimeList', () => {
  test('reads each runtime with its id, identifier, image, and last use', () => {
    const state = parseFixtureState();

    expect(state.runtimes.map((runtime) => runtime.runtimeId)).toEqual([
      OFFERED_RUNTIME_ID,
      DEVICE_RUNTIME_ID,
      UNDELETABLE_RUNTIME_ID,
      UNDATED_RUNTIME_ID,
      RECENT_RUNTIME_ID,
    ]);
    expect(state.runtimes[0]).toEqual({
      runtimeId: OFFERED_RUNTIME_ID,
      runtimeIdentifier: OFFERED_RUNTIME_IDENTIFIER,
      imagePath: buildRuntimeImagePath({ runtimeId: OFFERED_RUNTIME_ID }),
      isDeletable: true,
      lastUsedAtMs: OFFERED_RUNTIME_LAST_USED_AT_MS,
    });
    expect(state.runtimes[2]?.isDeletable).toBe(false);
    expect(state.runtimes[3]?.lastUsedAtMs).toBeNull();
  });

  test('reads an empty list', () => {
    expect(parseSimulatorRuntimeList({ stdoutText: '{}' })).toEqual({
      kind: 'succeeded',
      value: [],
    });
  });

  test('rejects text that is no JSON object', () => {
    expect(parseSimulatorRuntimeList({ stdoutText: 'garbage' }).kind).toBe('failed');
    expect(parseSimulatorRuntimeList({ stdoutText: '[]' }).kind).toBe('failed');
  });

  test('rejects a runtime whose id is no UUID', () => {
    for (const runtimeId of ['--all', 'com.apple.CoreSimulator.SimRuntime.iOS-18-2']) {
      const entry = buildRuntimeEntry({
        runtimeId: runtimeId,
        runtimeIdentifier: OFFERED_RUNTIME_IDENTIFIER,
        version: '17.0',
        isDeletable: true,
        lastUsedAt: '2025-01-02T03:04:05Z',
      });

      expect(
        parseSimulatorRuntimeList({ stdoutText: JSON.stringify({ [runtimeId]: entry }) }).kind,
      ).toBe('failed');
    }
  });

  test('rejects a last use in another format, and a relative image path', () => {
    const entry = buildRuntimeEntry({
      runtimeId: OFFERED_RUNTIME_ID,
      runtimeIdentifier: OFFERED_RUNTIME_IDENTIFIER,
      version: '17.0',
      isDeletable: true,
      lastUsedAt: '2025-01-02 03:04:05',
    });
    const relativeEntry = { ...entry, lastUsedAt: '2025-01-02T03:04:05Z', path: 'example.dmg' };

    for (const value of [entry, relativeEntry]) {
      expect(
        parseSimulatorRuntimeList({ stdoutText: JSON.stringify({ [OFFERED_RUNTIME_ID]: value }) })
          .kind,
      ).toBe('failed');
    }
  });
});

describe('buildSimulatorRuntimeFindings', () => {
  test('offers only the deletable runtime unused since the cutoff that no available device runs on', () => {
    const findings = buildSimulatorRuntimeFindings({
      tool: tool,
      state: parseFixtureState(),
      unusedCutoffMs: RUNTIME_UNUSED_CUTOFF_MS,
      processCommands: [],
    });

    expect(findings.map((finding) => finding.unit)).toEqual([buildOfferedUnit({ tool: tool })]);
  });

  test('offers the runtime of the available devices once no available device runs on it', () => {
    const state = parseFixtureState();
    const devices: SimulatorDevice[] = state.devices.map((device) => ({
      ...device,
      isAvailable: false,
    }));

    const findings = buildSimulatorRuntimeFindings({
      tool: tool,
      state: { runtimes: state.runtimes, devices: devices },
      unusedCutoffMs: RUNTIME_UNUSED_CUTOFF_MS,
      processCommands: [],
    });

    expect(findings.map((finding) => finding.unit)).toMatchObject([
      { runtimeId: OFFERED_RUNTIME_ID },
      { runtimeId: DEVICE_RUNTIME_ID },
    ]);
  });

  test('names the version, the last use, the risk, and the image', () => {
    const [finding] = buildSimulatorRuntimeFindings({
      tool: tool,
      state: parseFixtureState(),
      unusedCutoffMs: RUNTIME_UNUSED_CUTOFF_MS,
      processCommands: [],
    });

    expect(finding?.title).toBe('iOS 17.0 simulator runtime');
    expect(finding?.risk).toBe('review');
    expect(finding?.displayPath).toBe(buildRuntimeImagePath({ runtimeId: OFFERED_RUNTIME_ID }));
    expect(finding?.evidenceLines).toEqual([
      'Last used on 2025-01-02.',
      'No available simulator runs on it.',
    ]);
  });

  test('is busy while Simulator.app runs, and unknown without the processes', () => {
    const activities = [[SIMULATOR_APP_COMMAND], [], null].map((processCommands) =>
      buildSimulatorRuntimeFindings({
        tool: tool,
        state: parseFixtureState(),
        unusedCutoffMs: RUNTIME_UNUSED_CUTOFF_MS,
        processCommands: processCommands,
      }).map((finding) => finding.activity),
    );

    expect(activities).toEqual([['busy'], ['idle'], ['unknown']]);
  });
});

describe('compareSimulatorRuntime', () => {
  const unit = buildOfferedUnit({ tool: tool });

  test('answers unchanged, and busy while Simulator.app runs or the processes are unknown', () => {
    const state = parseFixtureState();

    expect(compareSimulatorRuntime({ unit: unit, state: state, processCommands: [] })).toEqual({
      kind: 'unchanged',
    });
    expect(
      compareSimulatorRuntime({
        unit: unit,
        state: state,
        processCommands: [SIMULATOR_APP_COMMAND],
      }),
    ).toEqual({ kind: 'busy' });
    expect(compareSimulatorRuntime({ unit: unit, state: state, processCommands: null })).toEqual({
      kind: 'busy',
    });
  });

  test('answers changed for a runtime no longer listed, no longer deletable, or used again', () => {
    const state = parseFixtureState();
    const [offered, ...others] = state.runtimes;

    if (offered === undefined) {
      throw new Error('The fixture lists the offered runtime first.');
    }

    const changedStates: SimulatorRuntimeState[] = [
      { runtimes: others, devices: state.devices },
      { runtimes: [{ ...offered, isDeletable: false }], devices: state.devices },
      {
        runtimes: [{ ...offered, lastUsedAtMs: OFFERED_RUNTIME_LAST_USED_AT_MS + 1 }],
        devices: state.devices,
      },
      { runtimes: [{ ...offered, lastUsedAtMs: null }], devices: state.devices },
    ];

    for (const changedState of changedStates) {
      expect(
        compareSimulatorRuntime({ unit: unit, state: changedState, processCommands: [] }),
      ).toEqual({ kind: 'changed' });
    }
  });

  test('answers changed once an available device runs on the runtime', () => {
    const state = parseFixtureState();
    const devices = state.devices.map((device) =>
      device.udid === AVAILABLE_UNDATED_DEVICE_UDID
        ? { ...device, runtimeIdentifier: OFFERED_RUNTIME_IDENTIFIER }
        : device,
    );

    expect(
      compareSimulatorRuntime({
        unit: unit,
        state: { runtimes: state.runtimes, devices: devices },
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('compares the last use for equality, whatever the cutoff', () => {
    const state = parseFixtureState();
    const recentUnit: ExploreToolUnitSimulatorRuntime = {
      ...unit,
      runtimeId: RECENT_RUNTIME_ID,
      runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-5',
      imagePath: buildRuntimeImagePath({ runtimeId: RECENT_RUNTIME_ID }),
      lastUsedAtMs: Date.parse('2026-04-05T06:07:08Z'),
    };

    expect(
      compareSimulatorRuntime({ unit: recentUnit, state: state, processCommands: [] }),
    ).toEqual({ kind: 'unchanged' });
  });
});

describe('the simulator runtime probe with a fake xcrun', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  async function createXcrun(params: { answers: ProbeFakeAnswer[] }): Promise<LocatedTool> {
    const path = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'xcrun',
      answers: params.answers,
    });

    return { name: 'xcrun', path: await realpath(path) };
  }

  test('startExploreProbes offers the runtime, all judged', async () => {
    const xcrun = await createXcrun({
      answers: buildWorkingAnswers({ homeDir: environment.homeDir }),
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ xcrun: xcrun.path }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve('/Applications/Xcode.app'),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: RUNTIME_UNUSED_CUTOFF_MS,
    });

    const outcome = await probes.simulatorRuntimes;

    if (outcome.kind !== 'probed') {
      throw new Error(`The runtime probe should have run, not ${outcome.kind}.`);
    }

    expect(outcome.isComplete).toBe(true);
    expect(outcome.findings.map((finding) => finding.unit)).toEqual([
      buildOfferedUnit({ tool: xcrun }),
    ]);
    expect(outcome.findings.map((finding) => finding.activity)).toEqual(['idle']);
  });

  test('fails when a command exits non-zero or prints garbage', async () => {
    const answers = buildWorkingAnswers({ homeDir: environment.homeDir });
    const failing = await createXcrun({
      answers: answers.map((answer) =>
        answer.command === 'simulatorDevices' ? { ...answer, exitCode: 3 } : answer,
      ),
    });
    const run = {
      environment: environment,
      processCommands: [],
      deadlineMs: Date.now() + TIMEOUT_MS,
      unusedCutoffMs: RUNTIME_UNUSED_CUTOFF_MS,
    };

    expect(await loadSimulatorRuntimeFindings({ ...run, tool: failing })).toEqual({
      kind: 'failed',
      failure: {
        reason: 'commandFailed',
        failure: { reason: 'exitedWithError', exitCode: 3, stderrTail: 'a line on stderr\n' },
      },
    });

    const garbled = await createXcrun({
      answers: answers.map((answer) =>
        answer.command === 'simulatorRuntimes' ? { ...answer, stdoutText: 'garbage' } : answer,
      ),
    });
    const findings = await loadSimulatorRuntimeFindings({ ...run, tool: garbled });

    expect(findings.kind === 'failed' && findings.failure.reason).toBe('outputUnreadable');
  });

  test('recheckExploreUnit runs both commands again and compares', async () => {
    const xcrun = await createXcrun({
      answers: buildWorkingAnswers({ homeDir: environment.homeDir }),
    });
    const unit = buildOfferedUnit({ tool: xcrun });
    const recheck = {
      tool: xcrun,
      environment: environment,
      processCommands: [],
      timeoutMs: TIMEOUT_MS,
    };

    expect(await recheckExploreUnit({ ...recheck, unit: unit })).toEqual({ kind: 'unchanged' });
    expect(
      await recheckExploreUnit({
        ...recheck,
        unit: unit,
        processCommands: [SIMULATOR_APP_COMMAND],
      }),
    ).toEqual({ kind: 'busy' });
    expect(
      await recheckExploreUnit({
        ...recheck,
        unit: { ...unit, lastUsedAtMs: OFFERED_RUNTIME_LAST_USED_AT_MS - 1 },
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('recheckExploreUnit fails when a command fails', async () => {
    const answers = buildWorkingAnswers({ homeDir: environment.homeDir });
    const failing = await createXcrun({
      answers: answers.map((answer) =>
        answer.command === 'simulatorRuntimes' ? { ...answer, exitCode: 2 } : answer,
      ),
    });

    const recheck = await recheckExploreUnit({
      unit: buildOfferedUnit({ tool: failing }),
      tool: failing,
      environment: environment,
      processCommands: [],
      timeoutMs: TIMEOUT_MS,
    });

    expect(recheck.kind === 'failed' && recheck.failure.reason).toBe('commandFailed');
  });
});
