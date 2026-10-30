import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogEntry, ExploreProbeId } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreFinding, ExploreToolFailure } from '../../src/explore/exploreUnit.js';
import type { ExploreProbeOutcome } from '../../src/explore/startExploreProbes.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import { loadExplorePhase } from '../../src/scan/loadExplorePhase.js';
import { createConcurrencyLimit } from '../../src/system/createConcurrencyLimit.js';
import { buildFixtureToolLocations, createProbeFakeTool } from '../explore/probeFakeTools.js';
import {
  buildDeviceDataPath,
  buildSimulatorDeviceListJson,
  NEVER_BOOTED_DEVICE_UDID,
} from '../explore/probeOutputFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestMiseToolName,
  buildTestMiseToolVersion,
} from '../support/parsedValueFixtures.js';

const MEASURE_TIMEOUT_MS = 10_000;

const runItemMeasurement = createConcurrencyLimit({ maxConcurrent: 4 });

function buildExploreEntry(params: { id: string; probe: ExploreProbeId }): CatalogEntry {
  return {
    id: params.id,
    category: 'developer',
    title: `Entry ${params.id}`,
    explanation: 'An example entry.',
    regeneration: 'It comes back.',
    risk: 'review',
    root: 'home',
    path: params.id,
    scope: 'self',
    ageRule: 'none',
    ownerBundleId: null,
    removal: { kind: 'explore', probe: params.probe, advice: `Advice of ${params.id}.` },
  };
}

const simulatorEntry = buildExploreEntry({ id: 'devices', probe: 'simulatorDevices' });

const dartEntry = buildExploreEntry({ id: 'dart', probe: 'dartPubCache' });

const miseEntry = buildExploreEntry({ id: 'mise', probe: 'miseVersions' });

const deleteEntry: CatalogEntry = { ...simulatorEntry, id: 'plain', removal: { kind: 'delete' } };

function buildProbes(
  outcomes: Record<ExploreProbeId, ExploreProbeOutcome>,
): Record<ExploreProbeId, Promise<ExploreProbeOutcome>> {
  return {
    simulatorDevices: Promise.resolve(outcomes.simulatorDevices),
    dartPubCache: Promise.resolve(outcomes.dartPubCache),
    miseVersions: Promise.resolve(outcomes.miseVersions),
  };
}

function buildMiseFinding(params: {
  installPath: string;
  activity: ExploreFinding['activity'];
}): ExploreFinding {
  return {
    unit: {
      kind: 'miseVersion',
      tool: { name: 'mise', path: '/opt/example/mise' },
      miseToolName: buildTestMiseToolName({ text: 'node' }),
      version: buildTestMiseToolVersion({ text: '20.1.0' }),
      installPath: buildTestAbsolutePath({ text: params.installPath }),
    },
    title: 'mise node 20.1.0',
    explanation: 'An example version.',
    regeneration: 'mise installs it again.',
    risk: 'review',
    evidenceLines: ['An example reason.'],
    displayPath: params.installPath,
    activity: params.activity,
  };
}

let fixtureRoot: FixtureRoot;
let environment: Environment;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

describe('loadExplorePhase', () => {
  test('offers each idle device the fake simctl finds, measured, and skips the booted one', async () => {
    const neverBootedDataPath = buildDeviceDataPath({
      homeDir: environment.homeDir,
      udid: NEVER_BOOTED_DEVICE_UDID,
    });

    await createFixtureDirectory({ path: neverBootedDataPath });
    await createFixtureFile({
      path: join(neverBootedDataPath, 'example.db'),
      sizeBytes: 8_192,
      modifiedMs: Date.now(),
    });

    const xcrun = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'xcrun',
      stdoutText: buildSimulatorDeviceListJson({ homeDir: environment.homeDir }),
      exitCode: 0,
    });
    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ xcrun: xcrun, dart: null, mise: null }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve('/Applications/Xcode.app'),
      timeoutMs: 10_000,
    });

    const phase = await loadExplorePhase({
      probes: probes,
      catalogEntries: [deleteEntry, simulatorEntry, dartEntry, miseEntry],
      measureTimeoutMs: MEASURE_TIMEOUT_MS,
      runItemMeasurement: runItemMeasurement,
    });

    expect(phase.issues).toEqual([]);
    expect(phase.fallbackEntries).toEqual([dartEntry, miseEntry]);
    expect(phase.decisions.map((decision) => decision.kind)).toEqual(['offer', 'offer', 'skip']);

    const neverBooted = phase.decisions[1];

    if (neverBooted?.kind !== 'offer') {
      throw new Error('The never-booted device should be offered.');
    }

    expect(neverBooted.candidate).toMatchObject({
      path: join(
        environment.homeDir,
        'Library/Developer/CoreSimulator/Devices',
        NEVER_BOOTED_DEVICE_UDID,
      ),
      category: 'developer',
      risk: 'review',
      origin: 'explore',
      entryCount: 2,
      isComplete: true,
      removal: {
        kind: 'runTool',
        unit: {
          kind: 'simulatorDevice',
          tool: { name: 'xcrun', path: await realpath(xcrun) },
          udid: NEVER_BOOTED_DEVICE_UDID,
          dataPath: neverBootedDataPath,
        },
      },
      evidenceLines: ['Simulator lists it as never booted.'],
    });
    expect(neverBooted.candidate.allocatedBytes).toBeGreaterThan(0);
    expect(phase.decisions[2]).toMatchObject({ kind: 'skip', reason: 'ownerRunning' });
  });

  test('offers a finding below any size threshold and skips an unknown one', async () => {
    const phase = await loadExplorePhase({
      probes: buildProbes({
        simulatorDevices: { kind: 'probed', findings: [] },
        dartPubCache: { kind: 'probed', findings: [] },
        miseVersions: {
          kind: 'probed',
          findings: [
            buildMiseFinding({ installPath: join(environment.homeDir, 'gone'), activity: 'idle' }),
            buildMiseFinding({
              installPath: join(environment.homeDir, 'other'),
              activity: 'unknown',
            }),
          ],
        },
      }),
      catalogEntries: [simulatorEntry, dartEntry, miseEntry],
      measureTimeoutMs: MEASURE_TIMEOUT_MS,
      runItemMeasurement: runItemMeasurement,
    });

    expect(phase.decisions).toMatchObject([
      { kind: 'offer', candidate: { allocatedBytes: 0, entryCount: 0, isComplete: true } },
      { kind: 'skip', path: join(environment.homeDir, 'other'), reason: 'runningUnknown' },
    ]);
    expect(phase.fallbackEntries).toEqual([]);
  });

  test('falls back to advice for a probe that did not run, with an issue unless the tool is missing', async () => {
    const miseFailure: ExploreToolFailure = {
      reason: 'commandFailed',
      failure: {
        reason: 'exitedWithError',
        exitCode: 3,
        stderrTail: '\nmise ERROR something broke\nmore\n',
      },
    };
    const phase = await loadExplorePhase({
      probes: buildProbes({
        simulatorDevices: { kind: 'toolMissing' },
        dartPubCache: {
          kind: 'toolUntrusted',
          failure: { reason: 'untrusted', path: '/opt/example/dart', detail: 'writableByOthers' },
        },
        miseVersions: {
          kind: 'failed',
          tool: { name: 'mise', path: '/opt/example/mise' },
          failure: miseFailure,
        },
      }),
      catalogEntries: [simulatorEntry, dartEntry, miseEntry],
      measureTimeoutMs: MEASURE_TIMEOUT_MS,
      runItemMeasurement: runItemMeasurement,
    });

    expect(phase.decisions).toEqual([]);
    expect(phase.fallbackEntries).toEqual([simulatorEntry, dartEntry, miseEntry]);
    expect(phase.issues).toEqual([
      { path: '/opt/example/dart', reason: 'toolUntrusted', detail: 'writableByOthers' },
      { path: '/opt/example/mise', reason: 'toolFailed', failure: miseFailure },
    ]);
  });

  test('keeps the failure of unreadable output in the issue', async () => {
    const phase = await loadExplorePhase({
      probes: buildProbes({
        simulatorDevices: {
          kind: 'failed',
          tool: { name: 'xcrun', path: '/usr/bin/xcrun' },
          failure: { reason: 'outputUnreadable', detail: 'no JSON' },
        },
        dartPubCache: { kind: 'toolMissing' },
        miseVersions: { kind: 'toolMissing' },
      }),
      catalogEntries: [simulatorEntry],
      measureTimeoutMs: MEASURE_TIMEOUT_MS,
      runItemMeasurement: runItemMeasurement,
    });

    expect(phase.issues).toEqual([
      {
        path: '/usr/bin/xcrun',
        reason: 'toolFailed',
        failure: { reason: 'outputUnreadable', detail: 'no JSON' },
      },
    ]);
  });
});
