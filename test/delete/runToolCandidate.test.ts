import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runToolCandidate } from '../../src/delete/runToolCandidate.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type {
  ExploreToolUnit,
  ExploreToolUnitDartPubCache,
  ExploreToolUnitMiseVersion,
  ExploreToolUnitSimulatorDevice,
} from '../../src/explore/exploreUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { loadUnitMeasurement } from '../../src/scan/loadUnitMeasurement.js';
import type { ToolName } from '../../src/tools/toolInstallLocations.js';
import { createUnitRunFakeTool } from '../explore/probeFakeTools.js';
import {
  buildDartGcDryRunText,
  buildDartGcPaths,
  buildDeviceDataPath,
  buildMiseInstallPath,
  buildMisePrunableJson,
  buildSimulatorDeviceListJson,
  UNAVAILABLE_DEVICE_UDID,
} from '../explore/probeOutputFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  isPresent,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { buildTestMiseToolName, buildTestMiseToolVersion } from '../support/parsedValueFixtures.js';

const TIMEOUT_MS = 10_000;

const SIMULATOR_APP_COMMAND =
  '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator';

const MEBIBYTE = 1_048_576;

let fixtureRoot: FixtureRoot;
let environment: Environment;
let markerPath: string;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  markerPath = join(fixtureRoot.rootDir, 'command-ran');
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function createUnitFile(params: { path: string; sizeBytes: number }): Promise<void> {
  await mkdir(dirname(params.path), { recursive: true });
  await createFixtureFile({
    path: params.path,
    sizeBytes: params.sizeBytes,
    modifiedMs: environment.nowMs,
  });
}

function buildToolPath(name: ToolName): string {
  return join(fixtureRoot.rootDir, 'tools', name);
}

/** Writes the unit's fake tool; its command first leaves the marker file, then runs `commandBody`. */
async function createUnitTool(params: {
  unit: ExploreToolUnit;
  probeStdoutText: string;
  probeExitCode?: number;
  commandBody: string;
  probePrelude?: string;
}): Promise<void> {
  await createUnitRunFakeTool({
    folder: join(fixtureRoot.rootDir, 'tools'),
    unit: params.unit,
    probeStdoutText: params.probeStdoutText,
    probeExitCode: params.probeExitCode ?? 0,
    commandBody: `touch '${markerPath}'
${params.commandBody}`,
    ...(params.probePrelude === undefined ? {} : { probePrelude: params.probePrelude }),
  });
}

async function createMiseUnit(version: string): Promise<ExploreToolUnitMiseVersion> {
  const installPath = buildMiseInstallPath({
    homeDir: environment.homeDir,
    toolName: 'node',
    version: version,
  });

  await createUnitFile({ path: join(installPath, 'bin/node'), sizeBytes: 16_384 });
  await createUnitFile({ path: join(installPath, 'lib/core.bin'), sizeBytes: 32_768 });

  return {
    kind: 'miseVersion',
    tool: { name: 'mise', path: buildToolPath('mise') },
    toolName: buildTestMiseToolName({ text: 'node' }),
    version: buildTestMiseToolVersion({ text: version }),
    installPath: installPath,
  };
}

async function createSimulatorUnit(): Promise<ExploreToolUnitSimulatorDevice> {
  const dataPath = buildDeviceDataPath({
    homeDir: environment.homeDir,
    udid: UNAVAILABLE_DEVICE_UDID,
  });

  await createUnitFile({ path: join(dataPath, 'Library/data.bin'), sizeBytes: 8192 });

  return {
    kind: 'simulatorDevice',
    tool: { name: 'xcrun', path: buildToolPath('xcrun') },
    udid: UNAVAILABLE_DEVICE_UDID,
    dataPath: dataPath,
  };
}

/** The unit of the fixture gc set, with a file in each of its paths. */
async function createDartUnit(): Promise<ExploreToolUnitDartPubCache> {
  const gcPaths = buildDartGcPaths({ homeDir: environment.homeDir });

  for (const gcPath of gcPaths) {
    await createUnitFile({
      path: gcPath.endsWith('.sha256') ? gcPath : join(gcPath, 'lib/package.dart'),
      sizeBytes: 4096,
    });
  }

  return { kind: 'dartPubCache', tool: { name: 'dart', path: buildToolPath('dart') }, gcPaths };
}

function buildRemoveCommands(paths: AbsolutePath[]): string {
  return paths.map((path) => `rm -r '${path}'`).join('\n');
}

async function measureAllocatedBytes(unit: ExploreToolUnit): Promise<number> {
  const measurement = await loadUnitMeasurement({ unit: unit, deadlineMs: Date.now() + 60_000 });

  return measurement.allocatedBytes;
}

async function loadNoProcessCommands(): Promise<string[] | null> {
  return [];
}

describe('runToolCandidate', () => {
  test('runs the command of an unchanged unit and reports the measured drop', async () => {
    const unit = await createMiseUnit('20.1.0');

    await createUnitTool({
      unit: unit,
      probeStdoutText: buildMisePrunableJson({ homeDir: environment.homeDir }),
      commandBody: `rm -r '${unit.installPath}'
echo 'uninstalled node@20.1.0' >&2
exit 0`,
    });

    const allocatedBytes = await measureAllocatedBytes(unit);

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: TIMEOUT_MS,
    });

    expect(allocatedBytes).toBeGreaterThan(0);
    expect(run).toEqual({
      kind: 'completed',
      freedBytes: allocatedBytes,
      stderrTail: 'uninstalled node@20.1.0\n',
    });
    expect(await isPresent(unit.installPath)).toBe(false);
  });

  test('runs the dart command and frees every path of its list', async () => {
    const unit = await createDartUnit();

    await createUnitTool({
      unit: unit,
      probeStdoutText: buildDartGcDryRunText({
        homeDir: environment.homeDir,
        gcPaths: unit.gcPaths,
      }),
      commandBody: `${buildRemoveCommands(unit.gcPaths)}
exit 0`,
    });

    const allocatedBytes = await measureAllocatedBytes(unit);

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: TIMEOUT_MS,
    });

    expect(allocatedBytes).toBeGreaterThan(0);
    expect(run).toEqual({ kind: 'completed', freedBytes: allocatedBytes, stderrTail: '' });

    for (const gcPath of unit.gcPaths) {
      expect(await isPresent(gcPath)).toBe(false);
    }
  });

  test('measures the unit before the recheck, so what the recheck adds counts as never freed', async () => {
    const unit = await createDartUnit();
    const [, packagePath] = unit.gcPaths;

    if (packagePath === undefined) {
      throw new Error('The fixture gc set should list a package folder.');
    }

    await createUnitTool({
      unit: unit,
      probeStdoutText: buildDartGcDryRunText({
        homeDir: environment.homeDir,
        gcPaths: unit.gcPaths,
      }),
      probePrelude: `/bin/dd if=/dev/zero of='${packagePath}/lib/added.bin' bs=${MEBIBYTE} count=1 2>/dev/null`,
      commandBody: `${buildRemoveCommands(unit.gcPaths)}
exit 0`,
    });

    const allocatedBytesBefore = await measureAllocatedBytes(unit);

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: TIMEOUT_MS,
    });

    expect(run).toEqual({ kind: 'completed', freedBytes: allocatedBytesBefore, stderrTail: '' });
    expect(allocatedBytesBefore).toBeLessThan(MEBIBYTE);
    expect(await isPresent(packagePath)).toBe(false);
  });

  test('skips the unit when its tool is gone', async () => {
    const unit = await createMiseUnit('20.1.0');

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: TIMEOUT_MS,
    });

    expect(run).toEqual({ kind: 'skipped', reason: 'changedSinceScan' });
    expect(await isPresent(unit.installPath)).toBe(true);
  });

  test('skips the unit when its tool is no longer trusted', async () => {
    const unit = await createMiseUnit('20.1.0');

    await createUnitTool({
      unit: unit,
      probeStdoutText: buildMisePrunableJson({ homeDir: environment.homeDir }),
      commandBody: `rm -r '${unit.installPath}'
exit 0`,
    });
    await chmod(buildToolPath('mise'), 0o777);

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: TIMEOUT_MS,
    });

    expect(run).toEqual({ kind: 'skipped', reason: 'changedSinceScan' });
    expect(await isPresent(markerPath)).toBe(false);
    expect(await isPresent(unit.installPath)).toBe(true);
  });

  test('skips the unit when the recheck finds it changed', async () => {
    const unit = await createMiseUnit('18.0.0');

    await createUnitTool({
      unit: unit,
      probeStdoutText: buildMisePrunableJson({ homeDir: environment.homeDir }),
      commandBody: `rm -r '${unit.installPath}'
exit 0`,
    });

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: TIMEOUT_MS,
    });

    expect(run).toEqual({ kind: 'skipped', reason: 'changedSinceScan' });
    expect(await isPresent(markerPath)).toBe(false);
    expect(await isPresent(unit.installPath)).toBe(true);
  });

  test('skips a simulator while Simulator.app runs or the processes are unknown', async () => {
    const unit = await createSimulatorUnit();

    await createUnitTool({
      unit: unit,
      probeStdoutText: buildSimulatorDeviceListJson({ homeDir: environment.homeDir }),
      commandBody: `rm -r '${unit.dataPath}'
exit 0`,
    });

    const whileSimulatorRuns = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: async () => [SIMULATOR_APP_COMMAND],
      timeoutMs: TIMEOUT_MS,
    });
    const whileProcessesUnknown = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: async () => null,
      timeoutMs: TIMEOUT_MS,
    });

    expect(whileSimulatorRuns).toEqual({ kind: 'skipped', reason: 'ownerRunning' });
    expect(whileProcessesUnknown).toEqual({ kind: 'skipped', reason: 'ownerRunning' });
    expect(await isPresent(markerPath)).toBe(false);
    expect(await isPresent(unit.dataPath)).toBe(true);
  });

  test('fails without freeing anything when the probe of the recheck fails', async () => {
    const unit = await createMiseUnit('20.1.0');

    await createUnitTool({
      unit: unit,
      probeStdoutText: buildMisePrunableJson({ homeDir: environment.homeDir }),
      probeExitCode: 1,
      commandBody: 'exit 0',
    });

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: TIMEOUT_MS,
    });

    expect(run).toEqual({
      kind: 'failed',
      freedBytes: 0,
      failure: {
        reason: 'commandFailed',
        failure: { reason: 'exitedWithError', exitCode: 1, stderrTail: 'a line on stderr\n' },
      },
    });
    expect(await isPresent(markerPath)).toBe(false);
  });

  test('fails without freeing anything when the probe prints unreadable output', async () => {
    const unit = await createMiseUnit('20.1.0');

    await createUnitTool({
      unit: unit,
      probeStdoutText: 'not json at all',
      commandBody: 'exit 0',
    });

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: TIMEOUT_MS,
    });

    expect(run).toMatchObject({ kind: 'failed', freedBytes: 0 });
    expect(run.kind === 'failed' && run.failure.reason).toBe('outputUnreadable');
    expect(await isPresent(markerPath)).toBe(false);
  });

  test('keeps what a failed command removed and its exit code and stderr tail', async () => {
    const unit = await createMiseUnit('20.1.0');
    const removedPart = join(unit.installPath, 'lib');

    await createUnitTool({
      unit: unit,
      probeStdoutText: buildMisePrunableJson({ homeDir: environment.homeDir }),
      commandBody: `rm -r '${removedPart}'
echo 'cannot remove bin' >&2
exit 3`,
    });

    const allocatedBytesBefore = await measureAllocatedBytes(unit);

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: TIMEOUT_MS,
    });
    const allocatedBytesAfter = await measureAllocatedBytes(unit);

    expect(allocatedBytesAfter).toBeGreaterThan(0);
    expect(allocatedBytesAfter).toBeLessThan(allocatedBytesBefore);
    expect(run).toEqual({
      kind: 'failed',
      freedBytes: allocatedBytesBefore - allocatedBytesAfter,
      failure: {
        reason: 'commandFailed',
        failure: { reason: 'exitedWithError', exitCode: 3, stderrTail: 'cannot remove bin\n' },
      },
    });
    expect(await isPresent(removedPart)).toBe(false);
  });

  test('fails with a timeout when the command passes its limit', async () => {
    const unit = await createMiseUnit('20.1.0');

    await createUnitTool({
      unit: unit,
      probeStdoutText: buildMisePrunableJson({ homeDir: environment.homeDir }),
      commandBody: `sleep 5
exit 0`,
    });

    const run = await runToolCandidate({
      unit: unit,
      environment: environment,
      loadProcessCommands: loadNoProcessCommands,
      timeoutMs: 300,
    });

    expect(run).toMatchObject({
      kind: 'failed',
      freedBytes: 0,
      failure: { reason: 'commandFailed', failure: { reason: 'timedOut', timeoutMs: 300 } },
    });
    expect(await isPresent(unit.installPath)).toBe(true);
  });
});
