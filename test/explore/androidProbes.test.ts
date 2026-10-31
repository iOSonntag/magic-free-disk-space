import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type {
  ExplorePathUnitAndroidEmulator,
  ExplorePathUnitAndroidSystemImage,
} from '../../src/explore/exploreUnit.js';
import { recheckExplorePathUnit } from '../../src/explore/recheckExploreUnit.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { buildTestAndroidAvdName } from '../support/parsedValueFixtures.js';
import {
  ANDROID_EMULATOR_PROCESS_COMMAND,
  ANDROID_OLD_USE_MS,
  ANDROID_RECENT_USE_MS,
  ANDROID_UNUSED_CUTOFF_MS,
  buildAndroidImageSysdir,
  buildAndroidSdkRoot,
  createAndroidAvdHome,
  writeAndroidAvd,
  writeAndroidEmulator,
  writeAndroidSystemImage,
} from './androidFixtures.js';
import { buildFixtureToolLocations, createProbeFakeTool } from './probeFakeTools.js';
import { buildEmptyProjectPinsLoad } from './projectPinsFixtures.js';

let fixtureRoot: FixtureRoot;
let environment: Environment;
let homeDir: string;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  homeDir = environment.homeDir;
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

function buildSdkRoot(): AbsolutePath {
  return buildAndroidSdkRoot({ homeDir: homeDir });
}

describe('startExploreProbes with the Android probes', () => {
  test('offers the unused AVD with the located avdmanager, and the image no AVD names', async () => {
    const avdmanager = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'cmdline-tools', 'bin'),
      name: 'avdmanager',
      answers: [],
    });
    await writeAndroidSystemImage({ homeDir: homeDir, platform: 'android-35', abi: 'arm64-v8a' });
    const unusedImagePath = await writeAndroidSystemImage({
      homeDir: homeDir,
      platform: 'android-34',
      abi: 'arm64-v8a',
    });
    await writeAndroidEmulator({ homeDir: homeDir });
    const old = await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel_Old',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });
    await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel_Recent',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_RECENT_USE_MS,
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ avdmanager: avdmanager }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(null),
      projectPins: buildEmptyProjectPinsLoad(),
      timeoutMs: 10_000,
      unusedCutoffMs: ANDROID_UNUSED_CUTOFF_MS,
    });

    expect(await probes.androidAvds).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: {
            kind: 'androidAvd',
            tool: { name: 'avdmanager', path: await realpath(avdmanager) },
            sdkRoot: buildSdkRoot(),
            name: buildTestAndroidAvdName({ text: 'Pixel_Old' }),
            avdPath: old.avdPath,
            iniPath: old.iniPath,
            lastUsedAtMs: ANDROID_OLD_USE_MS,
          },
          activity: 'idle',
        }),
      ],
      isComplete: true,
    });
    expect(await probes.androidSystemImages).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: {
            kind: 'androidSystemImage',
            sdkRoot: buildSdkRoot(),
            folderPath: unusedImagePath,
          },
        }),
      ],
      isComplete: true,
    });
    expect(await probes.androidEmulator).toEqual({
      kind: 'probed',
      findings: [],
      isComplete: true,
    });
  });
});

describe('recheckExplorePathUnit with the Android path units', () => {
  async function createPackageUnits(): Promise<{
    image: ExplorePathUnitAndroidSystemImage;
    emulator: ExplorePathUnitAndroidEmulator;
  }> {
    const imagePath = await writeAndroidSystemImage({
      homeDir: homeDir,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    const emulatorPath = await writeAndroidEmulator({ homeDir: homeDir });
    await createAndroidAvdHome({ homeDir: homeDir });

    return {
      image: { kind: 'androidSystemImage', sdkRoot: buildSdkRoot(), folderPath: imagePath },
      emulator: { kind: 'androidEmulator', sdkRoot: buildSdkRoot(), folderPath: emulatorPath },
    };
  }

  test('answers unchanged for an image and the emulator still offered and idle', async () => {
    const units = await createPackageUnits();

    for (const unit of [units.image, units.emulator]) {
      expect(
        await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
      ).toEqual({ kind: 'unchanged' });
    }
  });

  test('answers busy for both while an emulator runs', async () => {
    const units = await createPackageUnits();

    for (const unit of [units.image, units.emulator]) {
      expect(
        await recheckExplorePathUnit({
          unit: unit,
          environment: environment,
          processCommands: [ANDROID_EMULATOR_PROCESS_COMMAND],
        }),
      ).toEqual({ kind: 'busy' });
    }
  });

  test('answers changed for both once an AVD names the image', async () => {
    const units = await createPackageUnits();
    await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_RECENT_USE_MS,
    });

    for (const unit of [units.image, units.emulator]) {
      expect(
        await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
      ).toEqual({ kind: 'changed' });
    }
  });
});
