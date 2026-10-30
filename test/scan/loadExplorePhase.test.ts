import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, realpath, rename, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogEntry, ExploreProbeId } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreFinding, ExploreToolFailure } from '../../src/explore/exploreUnit.js';
import type { ExploreProbeOutcome } from '../../src/explore/startExploreProbes.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import { loadVscodeExtensionFindings } from '../../src/explore/vscodeExtensions/loadVscodeExtensionFindings.js';
import type { ExplorePhase } from '../../src/scan/loadExplorePhase.js';
import { loadExplorePhase } from '../../src/scan/loadExplorePhase.js';
import { createConcurrencyLimit } from '../../src/system/createConcurrencyLimit.js';
import { loadFileIdentity } from '../../src/system/loadFileIdentity.js';
import { buildFixtureToolLocations, createProbeFakeTool } from '../explore/probeFakeTools.js';
import {
  buildDeviceDataPath,
  buildSimulatorDeviceListJson,
  UNAVAILABLE_DEVICE_UDID,
} from '../explore/probeOutputFixtures.js';
import {
  buildObsoleteVscodeUnit,
  buildOlderVscodeUnit,
  buildVscodeExtensionsPath,
  createVscodeInstallation,
  VSCODE_FOLDER_SIZE_BYTES,
} from '../explore/vscodeExtensionFixtures.js';
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

const vscodeEntry = buildExploreEntry({ id: 'vscode', probe: 'vscodeExtensions' });

const deleteEntry: CatalogEntry = { ...simulatorEntry, id: 'plain', removal: { kind: 'delete' } };

/** Each probe answers the outcome given, and every probe not given `toolMissing`. */
function buildProbes(
  outcomes: Partial<Record<ExploreProbeId, ExploreProbeOutcome>>,
): Record<ExploreProbeId, Promise<ExploreProbeOutcome>> {
  const toolMissing: ExploreProbeOutcome = { kind: 'toolMissing' };

  return {
    simulatorDevices: Promise.resolve(outcomes.simulatorDevices ?? toolMissing),
    dartPubCache: Promise.resolve(outcomes.dartPubCache ?? toolMissing),
    miseVersions: Promise.resolve(outcomes.miseVersions ?? toolMissing),
    simulatorRuntimes: Promise.resolve(outcomes.simulatorRuntimes ?? toolMissing),
    androidAvds: Promise.resolve(outcomes.androidAvds ?? toolMissing),
    androidSystemImages: Promise.resolve(outcomes.androidSystemImages ?? toolMissing),
    androidEmulator: Promise.resolve(outcomes.androidEmulator ?? toolMissing),
    homebrewAppleSilicon: Promise.resolve(outcomes.homebrewAppleSilicon ?? toolMissing),
    homebrewIntel: Promise.resolve(outcomes.homebrewIntel ?? toolMissing),
    vscodeExtensions: Promise.resolve(outcomes.vscodeExtensions ?? toolMissing),
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

/** The outcome of the VS Code probe over the fixture installation, which offers two folders. */
async function loadVscodeOutcome(): Promise<ExploreProbeOutcome> {
  await createVscodeInstallation({ homeDir: environment.homeDir });

  const findings = await loadVscodeExtensionFindings({
    environment: environment,
    processCommands: [],
    deadlineMs: Date.now() + 10_000,
    unusedCutoffMs: 0,
  });

  if (findings.kind === 'failed') {
    throw new Error(`The VS Code probe failed at ${findings.failure.path}.`);
  }

  return { kind: 'probed', findings: findings.value.findings, isComplete: true };
}

function loadVscodePhase(outcome: ExploreProbeOutcome): Promise<ExplorePhase> {
  return loadExplorePhase({
    environment: environment,
    probes: buildProbes({ vscodeExtensions: outcome }),
    catalogEntries: [vscodeEntry],
    measureTimeoutMs: MEASURE_TIMEOUT_MS,
    runItemMeasurement: runItemMeasurement,
  });
}

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

describe('loadExplorePhase', () => {
  test('offers each idle device the fake simctl finds, measured, and skips the booted one', async () => {
    const unavailableDataPath = buildDeviceDataPath({
      homeDir: environment.homeDir,
      udid: UNAVAILABLE_DEVICE_UDID,
    });

    await createFixtureDirectory({ path: unavailableDataPath });
    await createFixtureFile({
      path: join(unavailableDataPath, 'example.db'),
      sizeBytes: 8_192,
      modifiedMs: Date.now(),
    });

    const xcrun = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'xcrun',
      answers: [
        {
          command: 'simulatorDevices',
          stdoutText: buildSimulatorDeviceListJson({ homeDir: environment.homeDir }),
          exitCode: 0,
        },
      ],
    });
    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ xcrun: xcrun }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve('/Applications/Xcode.app'),
      timeoutMs: 10_000,
      unusedCutoffMs: 0,
    });

    const phase = await loadExplorePhase({
      environment: environment,
      probes: probes,
      catalogEntries: [deleteEntry, simulatorEntry, dartEntry, miseEntry],
      measureTimeoutMs: MEASURE_TIMEOUT_MS,
      runItemMeasurement: runItemMeasurement,
    });

    expect(phase.issues).toEqual([]);
    expect(phase.fallbackEntries).toEqual([dartEntry, miseEntry]);
    expect(phase.incompleteEntries).toEqual([]);
    expect(phase.decisions.map((decision) => decision.kind)).toEqual(['offer', 'skip']);

    const unavailable = phase.decisions[0];

    if (unavailable?.kind !== 'offer') {
      throw new Error('The device whose runtime is gone should be offered.');
    }

    expect(unavailable.candidate).toMatchObject({
      path: join(
        environment.homeDir,
        'Library/Developer/CoreSimulator/Devices',
        UNAVAILABLE_DEVICE_UDID,
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
          udid: UNAVAILABLE_DEVICE_UDID,
          dataPath: unavailableDataPath,
        },
      },
      evidenceLines: [
        'Its runtime com.apple.CoreSimulator.SimRuntime.iOS-17-0 is no longer installed.',
        'Simulator reports: runtime profile not found using "System" match policy',
      ],
    });
    expect(unavailable.candidate.allocatedBytes).toBeGreaterThan(0);
    expect(phase.decisions[1]).toMatchObject({ kind: 'skip', reason: 'ownerRunning' });
  });

  test('offers a finding below any size threshold and skips an unknown one', async () => {
    const phase = await loadExplorePhase({
      environment: environment,
      probes: buildProbes({
        simulatorDevices: { kind: 'probed', findings: [], isComplete: true },
        dartPubCache: { kind: 'probed', findings: [], isComplete: true },
        miseVersions: {
          kind: 'probed',
          isComplete: true,
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
      environment: environment,
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
    expect(phase.incompleteEntries).toEqual([]);
    expect(phase.issues).toEqual([
      { path: '/opt/example/dart', reason: 'toolUntrusted', detail: 'writableByOthers' },
      { path: '/opt/example/mise', reason: 'toolFailed', failure: miseFailure },
    ]);
  });

  test('falls back to advice for a probe that could not read a file, with a place issue', async () => {
    const registryPath = join(environment.homeDir, '.vscode/extensions/extensions.json');
    const phase = await loadVscodePhase({
      kind: 'unreadable',
      path: registryPath,
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });

    expect(phase).toEqual({
      decisions: [],
      issues: [{ path: registryPath, reason: 'permissionDenied', detail: 'EACCES' }],
      fallbackEntries: [vscodeEntry],
      incompleteEntries: [],
    });
  });

  test('keeps the findings of a probe that judged only part of its units and marks its entry', async () => {
    const outcome = await loadVscodeOutcome();

    if (outcome.kind !== 'probed') {
      throw new Error('The VS Code probe should have probed.');
    }

    const phase = await loadVscodePhase({ ...outcome, isComplete: false });

    expect(phase.decisions.map((decision) => decision.kind)).toEqual(['offer', 'offer']);
    expect(phase.issues).toEqual([]);
    expect(phase.fallbackEntries).toEqual([]);
    expect(phase.incompleteEntries).toEqual([vscodeEntry]);
  });

  test('offers the folder of a path unit, measured, with the identity it has now', async () => {
    const unit = buildObsoleteVscodeUnit({ homeDir: environment.homeDir });
    const phase = await loadVscodePhase(await loadVscodeOutcome());
    const identity = await loadFileIdentity({ path: unit.folderPath });

    if (identity.kind === 'failed') {
      throw new Error('The obsolete folder should exist.');
    }

    expect(phase.issues).toEqual([]);
    expect(phase.incompleteEntries).toEqual([]);
    expect(phase.decisions[0]).toEqual({
      kind: 'offer',
      candidate: {
        path: unit.folderPath,
        title: 'VS Code extension example.alpha 1.0.0',
        category: 'developer',
        risk: 'review',
        origin: 'explore',
        explanation:
          'An extension folder VS Code marked for removal after an uninstall or an update.',
        regeneration: 'VS Code downloads it again only if you install this version again.',
        allocatedBytes: VSCODE_FOLDER_SIZE_BYTES,
        entryCount: 2,
        isComplete: true,
        removal: { kind: 'deleteUnitFolder', identity: identity.value, unit: unit },
        evidenceLines: [
          "Neither VS Code's default registry nor any profile's lists this folder.",
          "VS Code's .obsolete file marks it for removal.",
        ],
      },
    });
  });

  test('adds nothing for a folder that vanished after the probe', async () => {
    const outcome = await loadVscodeOutcome();

    await rm(buildVscodeExtensionsPath({ homeDir: environment.homeDir }), { recursive: true });

    expect(await loadVscodePhase(outcome)).toEqual({
      decisions: [],
      issues: [],
      fallbackEntries: [],
      incompleteEntries: [],
    });
  });

  test('skips a folder that became a symbolic link after the probe', async () => {
    const unit = buildObsoleteVscodeUnit({ homeDir: environment.homeDir });
    const outcome = await loadVscodeOutcome();

    await rename(unit.folderPath, `${unit.folderPath}.moved`);
    await symlink(`${unit.folderPath}.moved`, unit.folderPath);

    const phase = await loadVscodePhase(outcome);

    expect(phase.decisions[0]).toEqual({
      kind: 'skip',
      path: unit.folderPath,
      reason: 'symbolicLink',
    });
    expect(phase.decisions[1]).toMatchObject({ kind: 'offer' });
  });

  test('adds a place issue for a folder whose identity cannot be read', async () => {
    const extensionsPath = buildVscodeExtensionsPath({ homeDir: environment.homeDir });
    const outcome = await loadVscodeOutcome();

    try {
      await chmod(extensionsPath, 0o000);

      const phase = await loadVscodePhase(outcome);

      expect(phase.decisions).toEqual([]);
      expect(phase.issues).toEqual(
        [
          buildObsoleteVscodeUnit({ homeDir: environment.homeDir }),
          buildOlderVscodeUnit({ homeDir: environment.homeDir }),
        ].map((unit) => ({ path: unit.folderPath, reason: 'permissionDenied', detail: 'EACCES' })),
      );
    } finally {
      await chmod(extensionsPath, 0o700);
    }
  });

  test('falls back to advice for a probe that ran past its deadline, with an issue at its path', async () => {
    const phase = await loadVscodePhase({ kind: 'timedOut' });

    expect(phase).toEqual({
      decisions: [],
      issues: [
        { path: join(environment.homeDir, 'vscode'), reason: 'walkStopped', detail: 'deadline' },
      ],
      fallbackEntries: [vscodeEntry],
      incompleteEntries: [],
    });
  });

  test('skips a path unit whose folder holds another volume, unoffered', async () => {
    const outcome = await loadVscodeOutcome();

    if (outcome.kind !== 'probed' || outcome.findings[0] === undefined) {
      throw new Error('The VS Code probe should have found a folder.');
    }

    const finding = outcome.findings[0];

    if (finding.unit.kind !== 'vscodeExtension') {
      throw new Error('The VS Code probe should have found an extension folder.');
    }

    const mountedFinding: ExploreFinding = {
      ...finding,
      unit: { ...finding.unit, folderPath: buildTestAbsolutePath({ text: '/dev' }) },
      activity: 'idle',
    };
    const phase = await loadVscodePhase({
      kind: 'probed',
      findings: [mountedFinding],
      isComplete: true,
    });

    expect(phase.decisions).toEqual([{ kind: 'skip', path: '/dev', reason: 'holdsOtherVolume' }]);
    expect(phase.issues).toEqual([]);
  });

  test('keeps the failure of unreadable output in the issue', async () => {
    const phase = await loadExplorePhase({
      environment: environment,
      probes: buildProbes({
        simulatorDevices: {
          kind: 'failed',
          tool: { name: 'xcrun', path: '/usr/bin/xcrun' },
          failure: { reason: 'outputUnreadable', detail: 'no JSON' },
        },
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
