import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import {
  buildAndroidEmulatorFindings,
  buildAndroidSystemImageFindings,
} from '../../src/explore/android/buildAndroidFindings.js';
import { compareAndroidAvdUnit } from '../../src/explore/android/compareAndroidAvdUnit.js';
import { compareAndroidPathUnit } from '../../src/explore/android/compareAndroidPathUnit.js';
import { decideAndroidSystemImageOffers } from '../../src/explore/android/decideAndroidPackageOffers.js';
import {
  loadAndroidAvdFindings,
  loadAndroidEmulatorFindings,
  loadAndroidSystemImageFindings,
} from '../../src/explore/android/loadAndroidProbeFindings.js';
import type { AndroidSdkRoot } from '../../src/explore/android/loadAndroidSdkRoots.js';
import type {
  AndroidAvd,
  AndroidAvdPresent,
  AndroidSdkState,
} from '../../src/explore/android/loadAndroidSdkState.js';
import {
  loadAndroidSdkState,
  parseAndroidImageSysdir,
} from '../../src/explore/android/loadAndroidSdkState.js';
import { parseAndroidIniText } from '../../src/explore/android/parseAndroidIniText.js';
import { parseAndroidPackagePath } from '../../src/explore/android/parseAndroidPackagePath.js';
import { recheckAndroidAvdUnit } from '../../src/explore/android/recheckAndroidAvdUnit.js';
import type { UnitComparison } from '../../src/explore/decideComparisonActivity.js';
import type {
  ExploreFinding,
  ExplorePathUnitAndroidEmulator,
  ExplorePathUnitAndroidPackage,
  ExplorePathUnitAndroidSystemImage,
  ExploreProbeFindings,
  ExploreToolUnitAndroidAvd,
} from '../../src/explore/exploreUnit.js';
import { formatHomeRelativePath } from '../../src/path/formatHomeRelativePath.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  updateModifiedMs,
} from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestAndroidAvdName,
  buildTestWindowsPath,
} from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { buildTestProbeRun, getProbeFindings, getUnitOfKind } from '../support/probeRunFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';
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
let sdkRoot: AbsolutePath;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  sdkRoot = buildAndroidSdkRoot({ folders: environment });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

/** The load of the Android state below the fixture home, at the SDK root of the host. */
function buildStateLoad(): Parameters<typeof loadAndroidSdkState>[0] {
  const platform = buildTestProbePlatform();

  return {
    pathRules: environment.pathRules,
    homeDir: environment.homeDir,
    sdkRoots: buildSdkRoots(),
    privacyDenialCode: platform.privacyDenialCode,
  };
}

/** The one SDK root of the fixture home, the platform's. */
function buildSdkRoots(): AndroidSdkRoot[] {
  return [{ path: sdkRoot, isRequired: true }];
}

type AndroidProbeAnswers = {
  avds: ExploreProbeFindings;
  systemImages: ExploreProbeFindings;
  emulator: ExploreProbeFindings;
};

async function loadAndroidProbeAnswers(
  commandLines: string[] | null = [],
): Promise<AndroidProbeAnswers> {
  const run = buildTestProbeRun({
    environment: environment,
    runningProcesses: buildRunningCommandLines(commandLines),
    unusedCutoffMs: ANDROID_UNUSED_CUTOFF_MS,
  });

  return {
    avds: getProbeFindings(
      await loadAndroidAvdFindings({ run: { ...run, tool: tool }, sdkRoots: buildSdkRoots() }),
    ),
    systemImages: getProbeFindings(
      await loadAndroidSystemImageFindings({ run: run, sdkRoots: buildSdkRoots() }),
    ),
    emulator: getProbeFindings(
      await loadAndroidEmulatorFindings({ run: run, sdkRoots: buildSdkRoots() }),
    ),
  };
}

function listUnits(findings: ExploreProbeFindings): ExploreFinding['unit'][] {
  return findings.findings.map((finding) => finding.unit);
}

function buildRecheckRun(commandLines: string[] | null) {
  return {
    tool: tool,
    environment: environment,
    platform: buildTestProbePlatform(),
    deadlineMs: Date.now() + 10_000,
    runningProcesses: buildRunningCommandLines(commandLines),
  };
}

async function loadFreshState() {
  const state = await loadAndroidSdkState(buildStateLoad());

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

describe('parseAndroidImageSysdir', () => {
  test('keeps the sysdir as written on macOS, and null for an empty one', () => {
    expect(
      parseAndroidImageSysdir({
        pathRules: POSIX_PATH_RULES,
        text: 'system-images/android-35/google_apis/arm64-v8a/',
      }),
    ).toBe('system-images/android-35/google_apis/arm64-v8a/');
    expect(parseAndroidImageSysdir({ pathRules: POSIX_PATH_RULES, text: '' })).toBeNull();
  });

  test('separates the names by either separator on Windows, and joins them by a backslash', () => {
    for (const text of [
      'system-images/android-35/google_apis/arm64-v8a/',
      'system-images\\android-35\\google_apis\\arm64-v8a\\',
      'system-images\\android-35/google_apis\\\\arm64-v8a',
    ]) {
      expect(parseAndroidImageSysdir({ pathRules: WIN32_PATH_RULES, text: text })).toBe(
        'system-images\\android-35\\google_apis\\arm64-v8a',
      );
    }
  });

  test('is null on Windows for a sysdir with no name', () => {
    for (const text of ['', '/', '\\\\']) {
      expect(parseAndroidImageSysdir({ pathRules: WIN32_PATH_RULES, text: text })).toBeNull();
    }
  });
});

describe('decideAndroidSystemImageOffers', () => {
  test('keeps an image whose folder an AVD names in another case on Windows', () => {
    const sdkRoot = buildTestWindowsPath({
      text: 'C:\\Users\\tester\\AppData\\Local\\Android\\Sdk',
    });
    const avd: AndroidAvdPresent = {
      kind: 'present',
      iniPath: buildTestWindowsPath({ text: 'C:\\Users\\tester\\.android\\avd\\Pixel.ini' }),
      name: buildTestAndroidAvdName({ text: 'Pixel' }),
      avdPath: buildTestWindowsPath({ text: 'C:\\Users\\tester\\.android\\avd\\Pixel.avd' }),
      imageSysdir: parseAndroidImageSysdir({
        pathRules: WIN32_PATH_RULES,
        text: 'System-Images\\android-35\\Google_APIs\\x86_64\\',
      }),
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    };
    const state: AndroidSdkState = {
      pathRules: WIN32_PATH_RULES,
      sdks: [
        {
          sdkRoot: sdkRoot,
          systemImages: [
            {
              kind: 'parsed',
              folderPath: buildTestWindowsPath({
                text: `${sdkRoot}\\system-images\\android-35\\google_apis\\x86_64`,
              }),
              packagePath: 'system-images;android-35;google_apis;x86_64',
            },
          ],
          emulator: null,
        },
      ],
      avds: [avd],
    };

    expect(decideAndroidSystemImageOffers(state)).toEqual({ offers: [], isComplete: true });
  });
});

describe('the texts of the Android package findings', () => {
  const avdHomeCases = [
    {
      pathRules: POSIX_PATH_RULES,
      homeDir: buildTestAbsolutePath({ text: '/Users/tester' }),
      avdHomeText: '~/.android/avd',
    },
    {
      pathRules: WIN32_PATH_RULES,
      homeDir: buildTestWindowsPath({ text: 'C:\\Users\\tester' }),
      avdHomeText: '~\\.android\\avd',
    },
  ];

  for (const avdHomeCase of avdHomeCases) {
    test(`name the folder of the AVDs as ${avdHomeCase.avdHomeText}`, () => {
      const findingsParams = {
        pathRules: avdHomeCase.pathRules,
        homeDir: avdHomeCase.homeDir,
        offers: {
          offers: [
            {
              sdkRoot: avdHomeCase.homeDir,
              folderPath: avdHomeCase.homeDir,
              packagePath: 'emulator',
            },
          ],
          isComplete: true,
        },
        runningProcesses: buildRunningCommandLines([]),
      };
      const [image] = buildAndroidSystemImageFindings(findingsParams).findings;
      const [emulator] = buildAndroidEmulatorFindings(findingsParams).findings;

      expect(image?.explanation).toBe(
        `A system image of the Android SDK that no AVD in ${avdHomeCase.avdHomeText} uses. AVDs moved elsewhere, such as by \`ANDROID_AVD_HOME\`, are not seen here. A deleted image downloads again when an AVD needs it.`,
      );
      expect(emulator?.explanation).toBe(
        `The Android emulator of the SDK, which only runs AVDs, while ${avdHomeCase.avdHomeText} holds none. AVDs moved elsewhere, such as by \`ANDROID_AVD_HOME\`, are not seen here. A deleted emulator downloads again when an AVD needs it.`,
      );
      expect(emulator?.evidenceLines[0]).toBe(`No AVD exists in ${avdHomeCase.avdHomeText}.`);
    });
  }
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
      home: environment,
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
    await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    await writeAndroidEmulator({ folders: environment });

    expect(await loadAndroidProbeAnswers()).toEqual({
      avds: JUDGED_EMPTY,
      systemImages: NOT_JUDGED,
      emulator: NOT_JUDGED,
    });
  });

  test('with an empty ~/.android/avd offer every image and the emulator, named by package', async () => {
    const imagePath = await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    const emulatorPath = await writeAndroidEmulator({ folders: environment });
    await createAndroidAvdHome({ home: environment });

    const answers = await loadAndroidProbeAnswers();

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
    expect(emulator?.title).toBe('Android emulator package');
    const avdHomeText = formatHomeRelativePath({
      rules: environment.pathRules,
      path: buildAndroidAvdHome({ home: environment }),
      homeDir: environment.homeDir,
    });

    expect(emulator?.evidenceLines[0]).toBe(`No AVD exists in ${avdHomeText}.`);
    expect(image?.regeneration).toBe(
      'The SDK Manager of Android Studio installs it again, as does `sdkmanager "system-images;android-35;google_apis;arm64-v8a"`.',
    );
    expect(emulator?.regeneration).toBe(
      'The SDK Manager of Android Studio installs it again, as does `sdkmanager "emulator"`.',
    );

    for (const finding of [image, emulator]) {
      expect(finding?.explanation).toContain('`ANDROID_AVD_HOME`');
      expect(finding?.explanation).toContain('downloads again when an AVD needs it');
    }
  });

  test('offer an AVD unused since the cutoff with the images no AVD names, not the emulator', async () => {
    await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    const unusedImagePath = await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-34',
      abi: 'arm64-v8a',
    });
    await writeAndroidEmulator({ folders: environment });
    const old = await writeAndroidAvd({
      home: environment,
      name: 'Pixel_Old',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });
    await writeAndroidAvd({
      home: environment,
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
    const imageSysdir = parseAndroidImageSysdir({
      pathRules: environment.pathRules,
      text: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
    });

    expect(answers.avds.findings[0]?.evidenceLines).toEqual([
      'Last used on 2020-09-13, by the dates of its emulator files.',
      `It runs the system image ${imageSysdir}.`,
    ]);
    expect(answers.systemImages).toEqual({
      findings: [expect.objectContaining({ displayPath: unusedImagePath })],
      isComplete: true,
    });
    expect(answers.emulator).toEqual(JUDGED_EMPTY);
  });

  test('mark each finding busy while an emulator runs, and unknown without processes', async () => {
    await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    await writeAndroidAvd({
      home: environment,
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
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    const unparsablePath = join(sdkRoot, 'system-images', 'x', 'y', 'z');
    await mkdir(unparsablePath, { recursive: true });
    await writeFile(join(unparsablePath, 'package.xml'), '<repository/>');
    await mkdir(join(sdkRoot, 'system-images', 'a', 'b', 'c'), { recursive: true });
    await createAndroidAvdHome({ home: environment });

    const answers = await loadAndroidProbeAnswers();

    expect(answers.systemImages).toEqual({
      findings: [expect.objectContaining({ displayPath: imagePath })],
      isComplete: false,
    });
  });

  test('read an image folder whose package.xml is no file as not judged', async () => {
    const folderPath = join(sdkRoot, 'system-images', 'x', 'y', 'z');
    await mkdir(join(folderPath, 'package.xml'), { recursive: true });
    await createAndroidAvdHome({ home: environment });

    expect((await loadAndroidProbeAnswers()).systemImages).toEqual(NOT_JUDGED);
  });

  test('leave the emulator not judged when its package.xml does not parse, and absent without it', async () => {
    const emulatorPath = await writeAndroidEmulator({ folders: environment });
    await createAndroidAvdHome({ home: environment });
    await writeFile(join(emulatorPath, 'package.xml'), 'garbage');

    expect((await loadAndroidProbeAnswers()).emulator).toEqual(NOT_JUDGED);

    await rm(join(emulatorPath, 'package.xml'));

    expect((await loadAndroidProbeAnswers()).emulator).toEqual(JUDGED_EMPTY);
  });

  test('leave an AVD whose ini names no path not judged, and the images with it', async () => {
    await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    await writeAndroidEmulator({ folders: environment });
    await createAndroidAvdHome({ home: environment });
    await writeFile(
      join(buildAndroidAvdHome({ home: environment }), 'Pixel.ini'),
      'target=android-35\n',
    );

    expect(await loadAndroidProbeAnswers()).toEqual({
      avds: NOT_JUDGED,
      systemImages: NOT_JUDGED,
      emulator: JUDGED_EMPTY,
    });
  });

  test('leave an AVD whose ini is no file not judged', async () => {
    await writeAndroidEmulator({ folders: environment });
    await mkdir(join(buildAndroidAvdHome({ home: environment }), 'Pixel.ini'), {
      recursive: true,
    });

    expect(await loadAndroidProbeAnswers()).toEqual({
      avds: NOT_JUDGED,
      systemImages: NOT_JUDGED,
      emulator: JUDGED_EMPTY,
    });
  });

  test('build no unit of an AVD whose folder is gone, and hold back the images', async () => {
    await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    const avd = await writeAndroidAvd({
      home: environment,
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

  test('hold back the images while an AVD config.ini names no image, and judge no AVD', async () => {
    await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    await writeAndroidAvd({
      home: environment,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    const answers = await loadAndroidProbeAnswers();

    expect(answers.systemImages).toEqual(NOT_JUDGED);
    expect(answers.avds).toEqual(NOT_JUDGED);
  });

  test('hold back the images while an AVD has no config.ini', async () => {
    await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    const avd = await writeAndroidAvd({
      home: environment,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });
    await rm(join(avd.avdPath, 'config.ini'));

    const answers = await loadAndroidProbeAnswers();

    expect(answers.systemImages).toEqual(NOT_JUDGED);
    expect(answers.avds).toEqual(NOT_JUDGED);
  });

  test('leave an AVD with none of its last-use files not judged', async () => {
    await writeAndroidEmulator({ folders: environment });
    const avd = await writeAndroidAvd({
      home: environment,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });
    await rm(join(avd.avdPath, 'config.ini'));
    await rm(join(avd.avdPath, 'hardware-qemu.ini'));

    expect((await loadAndroidProbeAnswers()).avds).toEqual(NOT_JUDGED);
  });

  test('leave an AVD whose name could start an option not judged, with no unit', async () => {
    await writeAndroidEmulator({ folders: environment });
    await writeAndroidAvd({
      home: environment,
      name: '-rf',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    const answers = await loadAndroidProbeAnswers();

    expect(answers.avds).toEqual(NOT_JUDGED);
    expect(answers.emulator).toEqual(JUDGED_EMPTY);
  });

  test('leave an AVD whose config.ini names no image not judged, with no unit', async () => {
    await writeAndroidEmulator({ folders: environment });
    await writeAndroidAvd({
      home: environment,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    expect((await loadAndroidProbeAnswers()).avds).toEqual(NOT_JUDGED);
  });

  test('leave an AVD whose ini names a folder not named *.avd not judged, though its config.ini names an image', async () => {
    await writeAndroidEmulator({ folders: environment });
    await writeAndroidAvd({
      home: environment,
      name: 'Old',
      folderName: 'notes',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    expect((await loadAndroidProbeAnswers()).avds).toEqual(NOT_JUDGED);
  });

  testOnPosix('fail with fileUnreadable on a denied read, naming the file', async () => {
    await writeAndroidEmulator({ folders: environment });
    const avd = await writeAndroidAvd({
      home: environment,
      name: 'Pixel',
      imageSysdir: null,
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });
    await chmod(avd.iniPath, 0o000);

    expect(await loadAndroidSdkState(buildStateLoad())).toEqual({
      kind: 'failed',
      failure: {
        reason: 'fileUnreadable',
        path: avd.iniPath,
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      },
    });
    expect(
      await loadAndroidSystemImageFindings({
        run: buildTestProbeRun({
          environment: environment,
          unusedCutoffMs: ANDROID_UNUSED_CUTOFF_MS,
        }),
        sdkRoots: buildSdkRoots(),
      }),
    ).toMatchObject({ kind: 'failed', failure: { reason: 'fileUnreadable', path: avd.iniPath } });
  });
});

describe('compareAndroidAvdUnit', () => {
  function buildAvdUnit(): ExploreToolUnitAndroidAvd {
    return {
      kind: 'androidAvd',
      tool: tool,
      sdkRoot: buildTestAbsolutePath({ text: '/Users/example/Library/Android/sdk' }),
      name: buildTestAndroidAvdName({ text: 'Pixel' }),
      avdPath: buildTestAbsolutePath({ text: '/Users/example/.android/avd/Pixel.avd' }),
      iniPath: buildTestAbsolutePath({ text: '/Users/example/.android/avd/Pixel.ini' }),
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    };
  }

  /** The unit's AVD as a present folder named `*.avd` that names an image. */
  function buildListedAvd(params: { unit: ExploreToolUnitAndroidAvd }): AndroidAvdPresent {
    return {
      kind: 'present',
      iniPath: params.unit.iniPath,
      name: params.unit.name,
      avdPath: params.unit.avdPath,
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: params.unit.lastUsedAtMs,
    };
  }

  function buildAvdState(params: {
    unit: ExploreToolUnitAndroidAvd;
    avds: AndroidAvd[] | null;
  }): AndroidSdkState {
    return {
      pathRules: POSIX_PATH_RULES,
      sdks: [{ sdkRoot: params.unit.sdkRoot, systemImages: [], emulator: null }],
      avds: params.avds,
    };
  }

  /** The comparison while no process runs. */
  function compareIdleAvd(params: {
    unit: ExploreToolUnitAndroidAvd;
    state: AndroidSdkState;
  }): UnitComparison {
    return compareAndroidAvdUnit({
      unit: params.unit,
      state: params.state,
      runningProcesses: buildRunningCommandLines([]),
    });
  }

  test('answers unchanged while the AVD is listed in its SDK at the same paths, name, and last use', () => {
    const unit = buildAvdUnit();
    const state = buildAvdState({ unit: unit, avds: [buildListedAvd({ unit: unit })] });

    expect(compareIdleAvd({ unit: unit, state: state })).toEqual({ kind: 'unchanged' });
  });

  test('answers busy while an emulator runs, and without processes', () => {
    const unit = buildAvdUnit();
    const state = buildAvdState({ unit: unit, avds: [buildListedAvd({ unit: unit })] });

    for (const runningProcesses of [
      buildRunningCommandLines([ANDROID_EMULATOR_PROCESS_COMMAND]),
      null,
    ]) {
      expect(
        compareAndroidAvdUnit({ unit: unit, state: state, runningProcesses: runningProcesses }),
      ).toEqual({ kind: 'busy' });
    }
  });

  test('answers changed once the AVD was used again', () => {
    const unit = buildAvdUnit();
    const usedAgain = { ...buildListedAvd({ unit: unit }), lastUsedAtMs: ANDROID_RECENT_USE_MS };
    const state = buildAvdState({ unit: unit, avds: [usedAgain] });

    expect(compareIdleAvd({ unit: unit, state: state })).toEqual({ kind: 'changed' });
  });

  test('answers changed once no AVD lists it, or ~/.android/avd is absent', () => {
    const unit = buildAvdUnit();

    for (const avds of [[], null]) {
      const state = buildAvdState({ unit: unit, avds: avds });

      expect(compareIdleAvd({ unit: unit, state: state })).toEqual({ kind: 'changed' });
    }
  });

  test('answers changed once its folder is missing, or its ini is unlocated', () => {
    const unit = buildAvdUnit();
    const missing: AndroidAvd = {
      kind: 'missing',
      iniPath: unit.iniPath,
      name: unit.name,
      avdPath: unit.avdPath,
    };
    const unlocated: AndroidAvd = { kind: 'unlocated', iniPath: unit.iniPath, name: unit.name };

    for (const avd of [missing, unlocated]) {
      const state = buildAvdState({ unit: unit, avds: [avd] });

      expect(compareIdleAvd({ unit: unit, state: state })).toEqual({ kind: 'changed' });
    }
  });

  test('answers changed once its name, ini path, or folder path no longer match', () => {
    const unit = buildAvdUnit();
    const listed = buildListedAvd({ unit: unit });
    const otherIniPath = buildTestAbsolutePath({ text: '/Users/example/.android/avd/Other.ini' });
    const otherAvdPath = buildTestAbsolutePath({ text: '/Users/example/.android/avd/Other.avd' });
    const differingAvds: AndroidAvdPresent[] = [
      { ...listed, name: buildTestAndroidAvdName({ text: 'Other' }) },
      { ...listed, iniPath: otherIniPath },
      { ...listed, avdPath: otherAvdPath },
    ];

    for (const avd of differingAvds) {
      const state = buildAvdState({ unit: unit, avds: [avd] });

      expect(compareIdleAvd({ unit: unit, state: state })).toEqual({ kind: 'changed' });
    }
  });

  test('answers changed once its config.ini names no image', () => {
    const unit = buildAvdUnit();
    const state = buildAvdState({
      unit: unit,
      avds: [{ ...buildListedAvd({ unit: unit }), imageSysdir: null }],
    });

    expect(compareIdleAvd({ unit: unit, state: state })).toEqual({ kind: 'changed' });
  });

  test('answers changed for a folder not named *.avd, though its config.ini names an image', () => {
    const notesPath = buildTestAbsolutePath({ text: '/Users/example/.android/avd/notes' });
    const unit = { ...buildAvdUnit(), avdPath: notesPath };
    const state = buildAvdState({ unit: unit, avds: [buildListedAvd({ unit: unit })] });

    expect(compareIdleAvd({ unit: unit, state: state })).toEqual({ kind: 'changed' });
  });

  test('answers changed without the SDK, or with the AVD in another SDK root', () => {
    const unit = buildAvdUnit();
    const avds = [buildListedAvd({ unit: unit })];
    const otherSdkRoot = buildTestAbsolutePath({ text: '/Users/example/Other/sdk' });
    const states: AndroidSdkState[] = [
      { pathRules: POSIX_PATH_RULES, sdks: [], avds: avds },
      {
        pathRules: POSIX_PATH_RULES,
        sdks: [{ sdkRoot: otherSdkRoot, systemImages: [], emulator: null }],
        avds: avds,
      },
    ];

    for (const state of states) {
      expect(compareIdleAvd({ unit: unit, state: state })).toEqual({ kind: 'changed' });
    }
  });
});

describe('recheckAndroidAvdUnit', () => {
  async function createOfferedAvd(): Promise<ExploreToolUnitAndroidAvd> {
    await writeAndroidEmulator({ folders: environment });
    await writeAndroidAvd({
      home: environment,
      name: 'Pixel',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_OLD_USE_MS,
    });

    return getUnitOfKind({ findings: (await loadAndroidProbeAnswers()).avds, kind: 'androidAvd' });
  }

  test('answers unchanged while the AVD is listed at the same path with the same last use', async () => {
    const unit = await createOfferedAvd();

    expect(await recheckAndroidAvdUnit({ unit: unit, run: buildRecheckRun([]) })).toEqual({
      kind: 'unchanged',
    });
  });

  test('answers busy while an emulator runs, and without processes', async () => {
    const unit = await createOfferedAvd();

    for (const commandLines of [[ANDROID_EMULATOR_PROCESS_COMMAND], null]) {
      expect(
        await recheckAndroidAvdUnit({ unit: unit, run: buildRecheckRun(commandLines) }),
      ).toEqual({ kind: 'busy' });
    }
  });

  testOnPosix('fails with fileUnreadable on a denied read', async () => {
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
    await writeAndroidSystemImage({
      sdkRoot: sdkRoot,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    await writeAndroidEmulator({ folders: environment });
    await createAndroidAvdHome({ home: environment });
    const answers = await loadAndroidProbeAnswers();

    return {
      image: getUnitOfKind({ findings: answers.systemImages, kind: 'androidSystemImage' }),
      emulator: getUnitOfKind({ findings: answers.emulator, kind: 'androidEmulator' }),
    };
  }

  /** The comparison while no process runs. */
  function compareIdlePathUnit(params: {
    unit: ExplorePathUnitAndroidPackage;
    state: AndroidSdkState;
  }): UnitComparison {
    return compareAndroidPathUnit({
      unit: params.unit,
      state: params.state,
      runningProcesses: buildRunningCommandLines([]),
    });
  }

  test('answers unchanged while still no AVD names the image and no AVD exists', async () => {
    const units = await createOfferedPackages();
    const state = await loadFreshState();

    for (const unit of [units.image, units.emulator]) {
      expect(compareIdlePathUnit({ unit: unit, state: state })).toEqual({ kind: 'unchanged' });
    }
  });

  test('answers busy while an emulator runs, and without processes', async () => {
    const units = await createOfferedPackages();
    const state = await loadFreshState();

    for (const runningProcesses of [
      buildRunningCommandLines([ANDROID_EMULATOR_PROCESS_COMMAND]),
      null,
    ]) {
      for (const unit of [units.image, units.emulator]) {
        expect(
          compareAndroidPathUnit({ unit: unit, state: state, runningProcesses: runningProcesses }),
        ).toEqual({ kind: 'busy' });
      }
    }
  });

  test('answers changed once an AVD names the image, which also makes the emulator used', async () => {
    const units = await createOfferedPackages();
    await writeAndroidAvd({
      home: environment,
      name: 'Pixel',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_RECENT_USE_MS,
    });
    const state = await loadFreshState();

    for (const unit of [units.image, units.emulator]) {
      expect(compareIdlePathUnit({ unit: unit, state: state })).toEqual({ kind: 'changed' });
    }
  });

  test('answers changed once the folder vanished', async () => {
    const units = await createOfferedPackages();
    await rm(units.image.folderPath, { recursive: true });
    await rm(units.emulator.folderPath, { recursive: true });
    const state = await loadFreshState();

    for (const unit of [units.image, units.emulator]) {
      expect(compareIdlePathUnit({ unit: unit, state: state })).toEqual({ kind: 'changed' });
    }
  });
});
