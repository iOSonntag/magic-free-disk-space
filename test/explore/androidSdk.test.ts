import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { compareAndroidPathUnit } from '../../src/explore/android/compareAndroidPathUnit.js';
import {
  loadAndroidAvdFindings,
  loadAndroidEmulatorFindings,
  loadAndroidSystemImageFindings,
} from '../../src/explore/android/loadAndroidProbeFindings.js';
import { loadAndroidSdkState } from '../../src/explore/android/loadAndroidSdkState.js';
import { parseAndroidIniText } from '../../src/explore/android/parseAndroidIniText.js';
import { parseAndroidPackagePath } from '../../src/explore/android/parseAndroidPackagePath.js';
import { recheckAndroidAvdUnit } from '../../src/explore/android/recheckAndroidAvdUnit.js';
import type {
  ExploreFinding,
  ExplorePathUnitAndroidEmulator,
  ExplorePathUnitAndroidSystemImage,
  ExploreProbeFindings,
  ExploreToolUnitAndroidAvd,
} from '../../src/explore/exploreUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  updateModifiedMs,
} from '../support/fixtureRoot.js';
import { buildTestAndroidAvdName } from '../support/parsedValueFixtures.js';
import {
  ANDROID_EMULATOR_PROCESS_COMMAND,
  ANDROID_OLD_USE_MS,
  ANDROID_RECENT_USE_MS,
  ANDROID_UNUSED_CUTOFF_MS,
  buildAndroidAvdHome,
  buildAndroidImageSysdir,
  buildAndroidPackageXml,
  buildAndroidSdkRoot,
  createAndroidAvdHome,
  writeAndroidAvd,
  writeAndroidEmulator,
  writeAndroidSystemImage,
} from './androidFixtures.js';

const tool: LocatedTool = { name: 'avdmanager', path: '/opt/example/cmdline-tools/bin/avdmanager' };

const JUDGED_EMPTY: ExploreProbeFindings = { findings: [], isComplete: true };

const NOT_JUDGED: ExploreProbeFindings = { findings: [], isComplete: false };

let fixtureRoot: FixtureRoot;
let environment: Environment;
let homeDir: AbsolutePath;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  homeDir = environment.homeDir;
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

type AndroidProbeAnswers = {
  avds: ExploreProbeFindings;
  systemImages: ExploreProbeFindings;
  emulator: ExploreProbeFindings;
};

async function loadAndroidProbeAnswers(
  processCommands: string[] | null = [],
): Promise<AndroidProbeAnswers> {
  const run = {
    environment: environment,
    processCommands: processCommands,
    deadlineMs: Date.now() + 10_000,
    unusedCutoffMs: ANDROID_UNUSED_CUTOFF_MS,
  };
  const avds = await loadAndroidAvdFindings({ ...run, tool: tool });
  const systemImages = await loadAndroidSystemImageFindings(run);
  const emulator = await loadAndroidEmulatorFindings(run);

  if (avds.kind === 'failed' || systemImages.kind === 'failed' || emulator.kind === 'failed') {
    throw new Error('An Android probe failed.');
  }

  return { avds: avds.value, systemImages: systemImages.value, emulator: emulator.value };
}

function listUnits(findings: ExploreProbeFindings): ExploreFinding['unit'][] {
  return findings.findings.map((finding) => finding.unit);
}

function buildRecheckRun(processCommands: string[] | null) {
  return {
    tool: tool,
    environment: environment,
    deadlineMs: Date.now() + 10_000,
    processCommands: processCommands,
  };
}

/** The first unit of the findings, which the test expects to be of the given kind. */
function takeFirstUnit<TUnit extends ExploreFinding['unit']>(
  findings: ExploreProbeFindings,
  kind: TUnit['kind'],
): TUnit {
  const unit = findings.findings[0]?.unit;

  if (unit?.kind !== kind) {
    throw new Error(`Expected a ${kind} unit.`);
  }

  // The kind check above narrows the unit; the compiler cannot follow it through the generic.
  return unit as TUnit;
}

async function loadFreshState() {
  const state = await loadAndroidSdkState({ homeDir: homeDir });

  if (state.kind === 'failed') {
    throw new Error('The Android state should load.');
  }

  return state.value;
}

describe('parseAndroidIniText and parseAndroidPackagePath', () => {
  test('reads keys with and without spaces around the equals sign', () => {
    const values = parseAndroidIniText({ text: 'path=/a/b.avd\nhw.cpu.arch = arm64\nno line\n' });

    expect(values.get('path')).toBe('/a/b.avd');
    expect(values.get('hw.cpu.arch')).toBe('arm64');
    expect(values.size).toBe(2);
  });

  test('reads the localPackage path, and null without one', () => {
    expect(
      parseAndroidPackagePath({
        packageXmlText: buildAndroidPackageXml({ packagePath: 'emulator' }),
      }),
    ).toBe('emulator');
    expect(
      parseAndroidPackagePath({ packageXmlText: '<localPackage obsolete="false">' }),
    ).toBeNull();
  });
});

describe('the Android probes without an SDK', () => {
  test('judge nothing to offer without the SDK and without ~/.android/avd', async () => {
    expect(await loadAndroidProbeAnswers()).toEqual({
      avds: JUDGED_EMPTY,
      systemImages: JUDGED_EMPTY,
      emulator: JUDGED_EMPTY,
    });
  });

  test('leave the AVD probe not judged while ~/.android/avd holds an ini', async () => {
    await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    expect(await loadAndroidProbeAnswers()).toEqual({
      avds: NOT_JUDGED,
      systemImages: JUDGED_EMPTY,
      emulator: JUDGED_EMPTY,
    });
  });
});

describe('the Android probes with an SDK', () => {
  test('without ~/.android/avd judge the AVDs empty and hold back images and the emulator', async () => {
    await writeAndroidSystemImage({ homeDir: homeDir, platform: 'android-35', abi: 'arm64-v8a' });
    await writeAndroidEmulator({ homeDir: homeDir });

    expect(await loadAndroidProbeAnswers()).toEqual({
      avds: JUDGED_EMPTY,
      systemImages: NOT_JUDGED,
      emulator: NOT_JUDGED,
    });
  });

  test('with an empty ~/.android/avd offer every image and the emulator, named by package', async () => {
    const imagePath = await writeAndroidSystemImage({
      homeDir: homeDir,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    const emulatorPath = await writeAndroidEmulator({ homeDir: homeDir });
    await createAndroidAvdHome({ homeDir: homeDir });

    const answers = await loadAndroidProbeAnswers();
    const sdkRoot = buildAndroidSdkRoot({ homeDir: homeDir });

    expect(answers.avds).toEqual(JUDGED_EMPTY);
    expect(answers.systemImages.isComplete).toBe(true);
    expect(listUnits(answers.systemImages)).toEqual([
      { kind: 'androidSystemImage', sdkRoot: sdkRoot, folderPath: imagePath },
    ]);
    expect(listUnits(answers.emulator)).toEqual([
      { kind: 'androidEmulator', sdkRoot: sdkRoot, folderPath: emulatorPath },
    ]);

    const [image] = answers.systemImages.findings;
    const [emulator] = answers.emulator.findings;

    expect(image?.title).toBe(
      'Android system image system-images;android-35;google_apis;arm64-v8a',
    );
    expect(image?.risk).toBe('review');
    expect(image?.displayPath).toBe(imagePath);
    expect(image?.activity).toBe('idle');
    expect(image?.evidenceLines).toEqual([
      'No AVD uses this image.',
      'The SDK knows it as `system-images;android-35;google_apis;arm64-v8a`.',
    ]);
    expect(emulator?.risk).toBe('review');
    expect(emulator?.evidenceLines[0]).toBe('No AVD exists in ~/.android/avd.');

    for (const finding of [image, emulator]) {
      expect(finding?.explanation).toContain('`ANDROID_AVD_HOME`');
      expect(finding?.explanation).toContain('downloads again when an AVD needs it');
    }
  });

  test('offer an AVD unused since the cutoff with the images no AVD names, not the emulator', async () => {
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
    await writeFile(join(old.avdPath, 'multiinstance.lock'), '');
    await updateModifiedMs({
      path: join(old.avdPath, 'multiinstance.lock'),
      modifiedMs: ANDROID_OLD_USE_MS + 1000,
    });

    const answers = await loadAndroidProbeAnswers();
    const sdkRoot = buildAndroidSdkRoot({ homeDir: homeDir });

    expect(answers.avds.isComplete).toBe(true);
    expect(listUnits(answers.avds)).toEqual([
      {
        kind: 'androidAvd',
        tool: tool,
        sdkRoot: sdkRoot,
        name: buildTestAndroidAvdName({ text: 'Pixel_Old' }),
        avdPath: old.avdPath,
        iniPath: old.iniPath,
        lastUsedAtMs: ANDROID_OLD_USE_MS + 1000,
      },
    ]);
    expect(answers.avds.findings[0]?.title).toBe('Android emulator Pixel_Old');
    expect(answers.avds.findings[0]?.risk).toBe('careful');
    expect(answers.avds.findings[0]?.displayPath).toBe(old.avdPath);
    expect(answers.avds.findings[0]?.evidenceLines).toEqual([
      'Last used on 2020-09-13, by the dates of its emulator files.',
      'It runs the system image system-images/android-35/google_apis/arm64-v8a/.',
    ]);
    expect(answers.systemImages).toEqual({
      findings: [expect.objectContaining({ displayPath: unusedImagePath })],
      isComplete: true,
    });
    expect(answers.emulator).toEqual(JUDGED_EMPTY);
  });

  test('mark each finding busy while an emulator runs, and unknown without processes', async () => {
    await writeAndroidSystemImage({ homeDir: homeDir, platform: 'android-35', abi: 'arm64-v8a' });
    await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-34', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    const busy = await loadAndroidProbeAnswers([ANDROID_EMULATOR_PROCESS_COMMAND]);
    const unknown = await loadAndroidProbeAnswers(null);

    expect(busy.avds.findings.map((finding) => finding.activity)).toEqual(['busy']);
    expect(busy.systemImages.findings.map((finding) => finding.activity)).toEqual(['busy']);
    expect(unknown.avds.findings.map((finding) => finding.activity)).toEqual(['unknown']);
  });

  test('leave an image folder with an unparsable package.xml not judged, and skip one without', async () => {
    const imagePath = await writeAndroidSystemImage({
      homeDir: homeDir,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    const sdkRoot = buildAndroidSdkRoot({ homeDir: homeDir });
    const unparsablePath = join(sdkRoot, 'system-images', 'x', 'y', 'z');
    await mkdir(unparsablePath, { recursive: true });
    await writeFile(join(unparsablePath, 'package.xml'), '<repository/>');
    await mkdir(join(sdkRoot, 'system-images', 'a', 'b', 'c'), { recursive: true });
    await createAndroidAvdHome({ homeDir: homeDir });

    const answers = await loadAndroidProbeAnswers();

    expect(answers.systemImages).toEqual({
      findings: [expect.objectContaining({ displayPath: imagePath })],
      isComplete: false,
    });
  });

  test('read an image folder whose package.xml is no file as not judged', async () => {
    const sdkRoot = buildAndroidSdkRoot({ homeDir: homeDir });
    const folderPath = join(sdkRoot, 'system-images', 'x', 'y', 'z');
    await mkdir(join(folderPath, 'package.xml'), { recursive: true });
    await createAndroidAvdHome({ homeDir: homeDir });

    expect((await loadAndroidProbeAnswers()).systemImages).toEqual(NOT_JUDGED);
  });

  test('leave the emulator not judged when its package.xml does not parse, and absent without it', async () => {
    const emulatorPath = await writeAndroidEmulator({ homeDir: homeDir });
    await createAndroidAvdHome({ homeDir: homeDir });
    await writeFile(join(emulatorPath, 'package.xml'), 'garbage');

    expect((await loadAndroidProbeAnswers()).emulator).toEqual(NOT_JUDGED);

    await rm(join(emulatorPath, 'package.xml'));

    expect((await loadAndroidProbeAnswers()).emulator).toEqual(JUDGED_EMPTY);
  });

  test('leave an AVD whose ini names no path not judged, and the images with it', async () => {
    await writeAndroidSystemImage({ homeDir: homeDir, platform: 'android-35', abi: 'arm64-v8a' });
    await writeAndroidEmulator({ homeDir: homeDir });
    await createAndroidAvdHome({ homeDir: homeDir });
    await writeFile(
      join(buildAndroidAvdHome({ homeDir: homeDir }), 'Pixel.ini'),
      'target=android-35\n',
    );

    expect(await loadAndroidProbeAnswers()).toEqual({
      avds: NOT_JUDGED,
      systemImages: NOT_JUDGED,
      emulator: JUDGED_EMPTY,
    });
  });

  test('leave an AVD whose ini is no file not judged', async () => {
    await writeAndroidEmulator({ homeDir: homeDir });
    await mkdir(join(buildAndroidAvdHome({ homeDir: homeDir }), 'Pixel.ini'), { recursive: true });

    expect(await loadAndroidProbeAnswers()).toEqual({
      avds: NOT_JUDGED,
      systemImages: NOT_JUDGED,
      emulator: JUDGED_EMPTY,
    });
  });

  test('build no unit of an AVD whose folder is gone, and hold back the images', async () => {
    await writeAndroidSystemImage({ homeDir: homeDir, platform: 'android-35', abi: 'arm64-v8a' });
    const avd = await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-34', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });
    await rm(avd.avdPath, { recursive: true });

    expect(await loadAndroidProbeAnswers()).toEqual({
      avds: JUDGED_EMPTY,
      systemImages: NOT_JUDGED,
      emulator: JUDGED_EMPTY,
    });
  });

  test('hold back the images while an AVD config.ini names no image, and still date the AVD', async () => {
    await writeAndroidSystemImage({ homeDir: homeDir, platform: 'android-35', abi: 'arm64-v8a' });
    await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    const answers = await loadAndroidProbeAnswers();

    expect(answers.systemImages).toEqual(NOT_JUDGED);
    expect(answers.avds.findings).toHaveLength(1);
    expect(answers.avds.findings[0]?.evidenceLines).toEqual([
      'Last used on 2020-09-13, by the dates of its emulator files.',
    ]);
  });

  test('hold back the images while an AVD has no config.ini', async () => {
    await writeAndroidSystemImage({ homeDir: homeDir, platform: 'android-35', abi: 'arm64-v8a' });
    const avd = await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });
    await rm(join(avd.avdPath, 'config.ini'));

    const answers = await loadAndroidProbeAnswers();

    expect(answers.systemImages).toEqual(NOT_JUDGED);
    expect(answers.avds.findings).toHaveLength(1);
  });

  test('leave an AVD with none of its last-use files not judged', async () => {
    await writeAndroidEmulator({ homeDir: homeDir });
    const avd = await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });
    await rm(join(avd.avdPath, 'config.ini'));
    await rm(join(avd.avdPath, 'hardware-qemu.ini'));

    expect((await loadAndroidProbeAnswers()).avds).toEqual(NOT_JUDGED);
  });

  test('leave an AVD whose name could start an option not judged, with no unit', async () => {
    await writeAndroidEmulator({ homeDir: homeDir });
    await writeAndroidAvd({
      homeDir: homeDir,
      name: '-rf',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    const answers = await loadAndroidProbeAnswers();

    expect(answers.avds).toEqual(NOT_JUDGED);
    expect(answers.emulator).toEqual(JUDGED_EMPTY);
  });

  test('fail with fileUnreadable on a denied read, naming the file', async () => {
    await writeAndroidEmulator({ homeDir: homeDir });
    const avd = await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });
    await chmod(avd.iniPath, 0o000);

    expect(await loadAndroidSdkState({ homeDir: homeDir })).toEqual({
      kind: 'failed',
      failure: {
        reason: 'fileUnreadable',
        path: avd.iniPath,
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      },
    });
    expect(
      await loadAndroidSystemImageFindings({
        environment: environment,
        processCommands: [],
        deadlineMs: Date.now() + 10_000,
        unusedCutoffMs: ANDROID_UNUSED_CUTOFF_MS,
      }),
    ).toMatchObject({ kind: 'failed', failure: { reason: 'fileUnreadable', path: avd.iniPath } });
  });
});

describe('recheckAndroidAvdUnit', () => {
  async function createOfferedAvd(): Promise<ExploreToolUnitAndroidAvd> {
    await writeAndroidEmulator({ homeDir: homeDir });
    await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    return takeFirstUnit((await loadAndroidProbeAnswers()).avds, 'androidAvd');
  }

  test('answers unchanged while the AVD is listed at the same path with the same last use', async () => {
    const unit = await createOfferedAvd();

    expect(await recheckAndroidAvdUnit({ unit: unit, run: buildRecheckRun([]) })).toEqual({
      kind: 'unchanged',
    });
  });

  test('answers changed once the AVD was used again', async () => {
    const unit = await createOfferedAvd();
    await updateModifiedMs({
      path: join(unit.avdPath, 'hardware-qemu.ini'),
      modifiedMs: ANDROID_RECENT_USE_MS,
    });

    expect(await recheckAndroidAvdUnit({ unit: unit, run: buildRecheckRun([]) })).toEqual({
      kind: 'changed',
    });
  });

  test('answers changed once the AVD is gone', async () => {
    const unit = await createOfferedAvd();
    await rm(unit.iniPath);

    expect(await recheckAndroidAvdUnit({ unit: unit, run: buildRecheckRun([]) })).toEqual({
      kind: 'changed',
    });
  });

  test('answers busy while an emulator runs, and without processes', async () => {
    const unit = await createOfferedAvd();

    for (const processCommands of [[ANDROID_EMULATOR_PROCESS_COMMAND], null]) {
      expect(
        await recheckAndroidAvdUnit({ unit: unit, run: buildRecheckRun(processCommands) }),
      ).toEqual({ kind: 'busy' });
    }
  });

  test('fails with fileUnreadable on a denied read', async () => {
    const unit = await createOfferedAvd();
    await chmod(unit.iniPath, 0o000);

    expect(await recheckAndroidAvdUnit({ unit: unit, run: buildRecheckRun([]) })).toMatchObject({
      kind: 'failed',
      failure: { reason: 'fileUnreadable', path: unit.iniPath },
    });
  });
});

describe('compareAndroidPathUnit', () => {
  async function createOfferedPackages(): Promise<{
    image: ExplorePathUnitAndroidSystemImage;
    emulator: ExplorePathUnitAndroidEmulator;
  }> {
    await writeAndroidSystemImage({ homeDir: homeDir, platform: 'android-35', abi: 'arm64-v8a' });
    await writeAndroidEmulator({ homeDir: homeDir });
    await createAndroidAvdHome({ homeDir: homeDir });
    const answers = await loadAndroidProbeAnswers();

    return {
      image: takeFirstUnit(answers.systemImages, 'androidSystemImage'),
      emulator: takeFirstUnit(answers.emulator, 'androidEmulator'),
    };
  }

  test('answers unchanged while still no AVD names the image and no AVD exists', async () => {
    const units = await createOfferedPackages();
    const state = await loadFreshState();

    for (const unit of [units.image, units.emulator]) {
      expect(compareAndroidPathUnit({ unit: unit, state: state, processCommands: [] })).toEqual({
        kind: 'unchanged',
      });
    }
  });

  test('answers busy while an emulator runs, and without processes', async () => {
    const units = await createOfferedPackages();
    const state = await loadFreshState();

    for (const processCommands of [[ANDROID_EMULATOR_PROCESS_COMMAND], null]) {
      for (const unit of [units.image, units.emulator]) {
        expect(
          compareAndroidPathUnit({ unit: unit, state: state, processCommands: processCommands }),
        ).toEqual({ kind: 'busy' });
      }
    }
  });

  test('answers changed once an AVD names the image, which also makes the emulator used', async () => {
    const units = await createOfferedPackages();
    await writeAndroidAvd({
      homeDir: homeDir,
      name: 'Pixel',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_RECENT_USE_MS,
    });
    const state = await loadFreshState();

    for (const unit of [units.image, units.emulator]) {
      expect(compareAndroidPathUnit({ unit: unit, state: state, processCommands: [] })).toEqual({
        kind: 'changed',
      });
    }
  });

  test('answers changed once the folder vanished', async () => {
    const units = await createOfferedPackages();
    await rm(units.image.folderPath, { recursive: true });
    await rm(units.emulator.folderPath, { recursive: true });
    const state = await loadFreshState();

    for (const unit of [units.image, units.emulator]) {
      expect(compareAndroidPathUnit({ unit: unit, state: state, processCommands: [] })).toEqual({
        kind: 'changed',
      });
    }
  });
});
