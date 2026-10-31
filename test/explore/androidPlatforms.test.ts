import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { buildAndroidPlatformFindings } from '../../src/explore/android/buildAndroidPlatformFindings.js';
import { compareAndroidPlatformUnit } from '../../src/explore/android/compareAndroidPlatformUnit.js';
import type { AndroidPlatformOffers } from '../../src/explore/android/decideAndroidPlatformOffers.js';
import { decideAndroidPlatformOffers } from '../../src/explore/android/decideAndroidPlatformOffers.js';
import type { AndroidPlatformState } from '../../src/explore/android/loadAndroidPlatformState.js';
import type { AndroidCompileSdkPins } from '../../src/explore/android/parseAndroidCompileSdkPins.js';
import { parseAndroidCompileSdkPins } from '../../src/explore/android/parseAndroidCompileSdkPins.js';
import type { ExplorePathUnitAndroidPlatform } from '../../src/explore/exploreUnit.js';
import type {
  ProjectPinFile,
  ProjectPinFileText,
} from '../../src/explore/projectPins/projectPins.js';
import type { ToolPins } from '../../src/explore/projectPins/selectToolPins.js';
import {
  PINNED_VERSION_REINSTALL_EXPLANATION,
  PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
} from '../../src/explore/projectPins/selectToolPins.js';
import { recheckExplorePathUnit } from '../../src/explore/recheckExploreUnit.js';
import type { ExploreProbeOutcome } from '../../src/explore/startExploreProbes.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import {
  ANDROID_EMULATOR_PROCESS_COMMAND,
  ANDROID_UNUSED_CUTOFF_MS,
  buildAndroidSdkRoot,
  createAndroidAvdHome,
  writeAndroidEmulator,
  writeAndroidPlatform,
  writeAndroidSystemImage,
} from './androidFixtures.js';
import { buildFixtureToolLocations } from './probeFakeTools.js';
import {
  buildSettledProjectPinsLoad,
  buildTestPinFileText,
  buildTestPinFileUnfit,
  buildTestPinFileUnreadable,
  buildTestProjectPins,
} from './projectPinsFixtures.js';

const EXAMPLE_SDK_ROOT = buildTestAbsolutePath({ text: '/Users/example/Library/Android/sdk' });

const EXAMPLE_GRADLE_PATH = '/Users/example/code/app/build.gradle';

function buildGradleText(text: string): ProjectPinFileText {
  return {
    path: buildTestAbsolutePath({ text: EXAMPLE_GRADLE_PATH }),
    kind: 'gradle',
    text: text,
  };
}

function parseGradleTexts(...texts: string[]): AndroidCompileSdkPins {
  return parseAndroidCompileSdkPins({ files: texts.map((text) => buildGradleText(text)) });
}

function buildApiLevelPins(...apiLevels: number[]): AndroidCompileSdkPins {
  return { kind: 'apiLevels', apiLevels: new Set(apiLevels) };
}

function buildExamplePlatformPath(folderName: string): AbsolutePath {
  return buildTestAbsolutePath({ text: join(EXAMPLE_SDK_ROOT, 'platforms', folderName) });
}

function buildExampleState(): AndroidPlatformState {
  return {
    sdkRoot: EXAMPLE_SDK_ROOT,
    platforms: [
      {
        kind: 'parsed',
        folderPath: buildExamplePlatformPath('android-34'),
        packagePath: 'platforms;android-34',
      },
      {
        kind: 'parsed',
        folderPath: buildExamplePlatformPath('android-35'),
        packagePath: 'platforms;android-35',
      },
    ],
  };
}

function buildTextPins(...texts: string[]): ToolPins {
  return { kind: 'texts', files: texts.map((text) => buildGradleText(text)) };
}

describe('parseAndroidCompileSdkPins', () => {
  test('reads a compileSdk indented in an android block', () => {
    expect(
      parseGradleTexts('android {\n    namespace "com.example"\n    compileSdk 34\n}\n'),
    ).toEqual(buildApiLevelPins(34));
  });

  test('reads a compileSdk on one line with its android block', () => {
    expect(parseGradleTexts('android { compileSdk 34 }\n')).toEqual(buildApiLevelPins(34));
  });

  test('reads a compileSdkVersion in an ext block', () => {
    expect(parseGradleTexts('ext { compileSdkVersion = 34 }\n')).toEqual(buildApiLevelPins(34));
  });

  test('reads a compileSdkVersion called with its level', () => {
    expect(parseGradleTexts('android {\n  compileSdkVersion(34)\n}\n')).toEqual(
      buildApiLevelPins(34),
    );
  });

  test('reads a quoted android-<N> value', () => {
    expect(parseGradleTexts('android {\n  compileSdk = "android-34"\n}\n')).toEqual(
      buildApiLevelPins(34),
    );
  });

  test('reads a mention set right after a dot', () => {
    expect(parseGradleTexts('android.compileSdkVersion 34\n')).toEqual(buildApiLevelPins(34));
    expect(parseGradleTexts('project.android.compileSdk = 34\n')).toEqual(buildApiLevelPins(34));
  });

  test('skips a read of the value right after a dot', () => {
    expect(
      parseGradleTexts('android { compileSdk 35 }\nInteger x = project.android.compileSdk\n'),
    ).toEqual(buildApiLevelPins(35));
    expect(
      parseGradleTexts('android { compileSdk 35 }\nprintln(android.compileSdk == 35)\n'),
    ).toEqual(buildApiLevelPins(35));
  });

  test('counts no longer word, such as compileSdkPreview', () => {
    expect(
      parseGradleTexts(
        'android {\n  compileSdk 34\n  compileSdkPreview "VanillaIceCream"\n  compileSdkExtension 5\n}\npluginCompileSdk = 30\n',
      ),
    ).toEqual(buildApiLevelPins(34));
  });

  test('pins every platform for a value no number names', () => {
    expect(
      parseGradleTexts('android {\n  compileSdkVersion flutter.compileSdkVersion\n}\n'),
    ).toEqual({ kind: 'everyPlatform' });
    expect(
      parseGradleTexts('android {\n  compileSdk rootProject.ext.compileSdkVersion\n}\n'),
    ).toEqual({ kind: 'everyPlatform' });
  });

  test('pins every platform for a compileSdk block', () => {
    expect(
      parseGradleTexts('android {\n  compileSdk {\n    version = release(36)\n  }\n}\n'),
    ).toEqual({ kind: 'everyPlatform' });
  });

  test('pins every platform for an android block that sets no compileSdk', () => {
    expect(
      parseGradleTexts(
        'android { compileSdk 34 }\n',
        'android {\n  namespace = "com.example"\n}\n',
      ),
    ).toEqual({ kind: 'everyPlatform' });
  });

  test('pins nothing for a file with neither a mention nor an android block', () => {
    expect(parseGradleTexts('plugins {\n  id "java"\n}\n')).toEqual(buildApiLevelPins());
  });

  test('collects the levels of every file', () => {
    expect(parseGradleTexts('android { compileSdk 33 }\n', 'android { compileSdk 34 }\n')).toEqual(
      buildApiLevelPins(33, 34),
    );
  });
});

describe('decideAndroidPlatformOffers', () => {
  test('offers each platform no Gradle file pins', () => {
    expect(
      decideAndroidPlatformOffers({
        state: buildExampleState(),
        pins: buildTextPins('android { compileSdk 35 }\n'),
      }),
    ).toEqual({
      offers: [
        {
          sdkRoot: EXAMPLE_SDK_ROOT,
          folderPath: buildExamplePlatformPath('android-34'),
          apiLevel: 34,
        },
      ],
      isComplete: true,
    });
  });

  test('offers nothing and judges when every version is pinned', () => {
    expect(
      decideAndroidPlatformOffers({
        state: buildExampleState(),
        pins: { kind: 'everyVersionPinned' },
      }),
    ).toEqual({ offers: [], isComplete: true });
  });

  test('offers nothing and judges when a file pins every platform', () => {
    expect(
      decideAndroidPlatformOffers({
        state: buildExampleState(),
        pins: buildTextPins('android {\n  compileSdk flutter.compileSdkVersion\n}\n'),
      }),
    ).toEqual({ offers: [], isComplete: true });
  });

  test('leaves an extension platform, a preview, and an unparsed folder not judged', () => {
    const state = buildExampleState();
    state.platforms.push(
      {
        kind: 'parsed',
        folderPath: buildExamplePlatformPath('android-33-ext5'),
        packagePath: 'platforms;android-33-ext5',
      },
      {
        kind: 'parsed',
        folderPath: buildExamplePlatformPath('android-VanillaIceCream'),
        packagePath: 'platforms;android-VanillaIceCream',
      },
      { kind: 'unparsed', folderPath: buildExamplePlatformPath('android-31') },
    );

    expect(
      decideAndroidPlatformOffers({
        state: state,
        pins: buildTextPins('android { compileSdk 34 }\n', 'android { compileSdk 35 }\n'),
      }),
    ).toEqual({ offers: [], isComplete: false });
  });
});

describe('buildAndroidPlatformFindings', () => {
  const offers: AndroidPlatformOffers = {
    offers: [
      {
        sdkRoot: EXAMPLE_SDK_ROOT,
        folderPath: buildExamplePlatformPath('android-34'),
        apiLevel: 34,
      },
    ],
    isComplete: true,
  };

  test('builds a careful finding that keeps the Gradle files as its pin files', () => {
    expect(
      buildAndroidPlatformFindings({
        offers: offers,
        gradleFiles: [buildGradleText('android { compileSdk 35 }\n')],
        projectPins: buildTestProjectPins({ files: [] }),
        processCommands: [],
      }),
    ).toEqual({
      findings: [
        {
          unit: {
            kind: 'androidPlatform',
            sdkRoot: EXAMPLE_SDK_ROOT,
            folderPath: buildExamplePlatformPath('android-34'),
            apiLevel: 34,
            pinFiles: [
              { path: buildTestAbsolutePath({ text: EXAMPLE_GRADLE_PATH }), kind: 'gradle' },
            ],
          },
          title: 'Android SDK Platform 34',
          explanation: expect.stringMatching(
            new RegExp(`${PINNED_VERSION_REINSTALL_EXPLANATION.replaceAll('.', '\\.')}$`),
          ),
          regeneration: expect.stringContaining('SDK Manager'),
          risk: 'careful',
          evidenceLines: ['None of the Gradle files found (1) sets `compileSdk` 34.'],
          displayPath: buildExamplePlatformPath('android-34'),
          activity: 'idle',
        },
      ],
      isComplete: true,
    });
  });

  test('adds the incomplete-search line and reads the emulator as busy', () => {
    const findings = buildAndroidPlatformFindings({
      offers: offers,
      gradleFiles: [],
      projectPins: buildTestProjectPins({ files: [], isWalkComplete: false }),
      processCommands: [ANDROID_EMULATOR_PROCESS_COMMAND],
    });

    expect(findings.findings[0]).toMatchObject({
      evidenceLines: [
        'None of the Gradle files found (0) sets `compileSdk` 34.',
        PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
      ],
      activity: 'busy',
    });
  });
});

describe('compareAndroidPlatformUnit', () => {
  const unit: ExplorePathUnitAndroidPlatform = {
    kind: 'androidPlatform',
    sdkRoot: EXAMPLE_SDK_ROOT,
    folderPath: buildExamplePlatformPath('android-34'),
    apiLevel: 34,
    pinFiles: [],
  };

  test('answers unchanged while the platform is still offered and idle', () => {
    expect(
      compareAndroidPlatformUnit({
        unit: unit,
        state: buildExampleState(),
        pins: buildTextPins('android { compileSdk 35 }\n'),
        processCommands: [],
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('answers changed once a Gradle file sets its level', () => {
    expect(
      compareAndroidPlatformUnit({
        unit: unit,
        state: buildExampleState(),
        pins: buildTextPins('android { compileSdk 34 }\n'),
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers changed once the folder is gone', () => {
    expect(
      compareAndroidPlatformUnit({
        unit: unit,
        state: { sdkRoot: EXAMPLE_SDK_ROOT, platforms: [] },
        pins: buildTextPins(),
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers busy while an emulator runs or the processes are unknown', () => {
    for (const processCommands of [[ANDROID_EMULATOR_PROCESS_COMMAND], null]) {
      expect(
        compareAndroidPlatformUnit({
          unit: unit,
          state: buildExampleState(),
          pins: buildTextPins(),
          processCommands: processCommands,
        }),
      ).toEqual({ kind: 'busy' });
    }
  });
});

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

function buildPlatformsPath(): string {
  return join(buildAndroidSdkRoot({ homeDir: homeDir }), 'platforms');
}

type AndroidProbeOutcomes = {
  platforms: ExploreProbeOutcome;
  systemImages: ExploreProbeOutcome;
  emulator: ExploreProbeOutcome;
};

async function loadAndroidProbeOutcomes(params: {
  pinFiles: ProjectPinFile[];
}): Promise<AndroidProbeOutcomes> {
  const probes = startExploreProbes({
    environment: environment,
    toolInstallLocations: buildFixtureToolLocations({}),
    processCommands: Promise.resolve([]),
    activeXcodeBundlePath: Promise.resolve(null),
    projectPins: buildSettledProjectPinsLoad({
      pins: { kind: 'succeeded', value: buildTestProjectPins({ files: params.pinFiles }) },
    }),
    timeoutMs: 10_000,
    unusedCutoffMs: ANDROID_UNUSED_CUTOFF_MS,
  });

  return {
    platforms: await probes.androidPlatforms,
    systemImages: await probes.androidSystemImages,
    emulator: await probes.androidEmulator,
  };
}

function buildHomeGradlePin(text: string): ProjectPinFile {
  return buildTestPinFileText({
    path: join(homeDir, 'code', 'app', 'build.gradle'),
    kind: 'gradle',
    text: text,
  });
}

describe('startExploreProbes with the Android platform probe', () => {
  test('offers the platform no Gradle file pins', async () => {
    const unpinnedPath = await writeAndroidPlatform({ homeDir: homeDir, folderName: 'android-34' });
    await writeAndroidPlatform({ homeDir: homeDir, folderName: 'android-35' });

    const outcomes = await loadAndroidProbeOutcomes({
      pinFiles: [buildHomeGradlePin('android {\n  compileSdk 35\n}\n')],
    });

    expect(outcomes.platforms).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: {
            kind: 'androidPlatform',
            sdkRoot: buildAndroidSdkRoot({ homeDir: homeDir }),
            folderPath: unpinnedPath,
            apiLevel: 34,
            pinFiles: [
              {
                path: buildTestAbsolutePath({ text: join(homeDir, 'code', 'app', 'build.gradle') }),
                kind: 'gradle',
              },
            ],
          },
          risk: 'careful',
          activity: 'idle',
        }),
      ],
      isComplete: true,
    });
  });

  test('offers nothing when every platform is pinned', async () => {
    await writeAndroidPlatform({ homeDir: homeDir, folderName: 'android-34' });
    await writeAndroidPlatform({ homeDir: homeDir, folderName: 'android-35' });

    const outcomes = await loadAndroidProbeOutcomes({
      pinFiles: [
        buildHomeGradlePin('android { compileSdk 34 }\n'),
        buildTestPinFileText({
          path: join(homeDir, 'code', 'other', 'build.gradle.kts'),
          kind: 'gradle',
          text: 'android {\n  compileSdk = 35\n}\n',
        }),
      ],
    });

    expect(outcomes.platforms).toEqual({ kind: 'probed', findings: [], isComplete: true });
  });

  test('offers nothing and judges when a pin pins every platform', async () => {
    await writeAndroidPlatform({ homeDir: homeDir, folderName: 'android-34' });

    for (const pinFile of [
      buildHomeGradlePin('android {\n  compileSdkVersion flutter.compileSdkVersion\n}\n'),
      buildTestPinFileUnfit({ path: join(homeDir, 'code', 'app', 'build.gradle'), kind: 'gradle' }),
    ]) {
      expect((await loadAndroidProbeOutcomes({ pinFiles: [pinFile] })).platforms).toEqual({
        kind: 'probed',
        findings: [],
        isComplete: true,
      });
    }
  });

  test('judges no SDK with no findings', async () => {
    expect((await loadAndroidProbeOutcomes({ pinFiles: [] })).platforms).toEqual({
      kind: 'probed',
      findings: [],
      isComplete: true,
    });
  });

  test('leaves an extension platform not judged', async () => {
    await writeAndroidPlatform({ homeDir: homeDir, folderName: 'android-33-ext5' });

    expect((await loadAndroidProbeOutcomes({ pinFiles: [] })).platforms).toEqual({
      kind: 'probed',
      findings: [],
      isComplete: false,
    });
  });

  test('answers unreadable on the platforms folder and leaves the other Android probes judged', async () => {
    await writeAndroidPlatform({ homeDir: homeDir, folderName: 'android-34' });
    await writeAndroidSystemImage({ homeDir: homeDir, platform: 'android-35', abi: 'arm64-v8a' });
    await writeAndroidEmulator({ homeDir: homeDir });
    await createAndroidAvdHome({ homeDir: homeDir });
    await chmod(buildPlatformsPath(), 0o000);

    try {
      const outcomes = await loadAndroidProbeOutcomes({ pinFiles: [] });

      expect(outcomes.platforms).toEqual({
        kind: 'unreadable',
        path: buildPlatformsPath(),
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      });
      expect(outcomes.systemImages).toMatchObject({ kind: 'probed', isComplete: true });
      expect(outcomes.emulator).toMatchObject({ kind: 'probed', isComplete: true });
    } finally {
      await chmod(buildPlatformsPath(), 0o755);
    }
  });

  test('answers unreadable on an unreadable Gradle file', async () => {
    await writeAndroidPlatform({ homeDir: homeDir, folderName: 'android-34' });
    const gradlePath = join(homeDir, 'code', 'app', 'build.gradle');

    const outcomes = await loadAndroidProbeOutcomes({
      pinFiles: [buildTestPinFileUnreadable({ path: gradlePath, kind: 'gradle' })],
    });

    expect(outcomes.platforms).toEqual({
      kind: 'unreadable',
      path: gradlePath,
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });
  });
});

describe('recheckExplorePathUnit with an Android platform unit', () => {
  async function createPlatformUnit(): Promise<{
    unit: ExplorePathUnitAndroidPlatform;
    gradlePath: string;
  }> {
    const folderPath = await writeAndroidPlatform({ homeDir: homeDir, folderName: 'android-34' });
    const gradlePath = join(homeDir, 'code', 'app', 'build.gradle');
    await mkdir(join(homeDir, 'code', 'app'), { recursive: true });
    await writeFile(gradlePath, 'android {\n  compileSdk 35\n}\n');

    return {
      unit: {
        kind: 'androidPlatform',
        sdkRoot: buildAndroidSdkRoot({ homeDir: homeDir }),
        folderPath: folderPath,
        apiLevel: 34,
        pinFiles: [{ path: buildTestAbsolutePath({ text: gradlePath }), kind: 'gradle' }],
      },
      gradlePath: gradlePath,
    };
  }

  test('answers unchanged while the platform is still offered and idle', async () => {
    const platform = await createPlatformUnit();

    expect(
      await recheckExplorePathUnit({
        unit: platform.unit,
        environment: environment,
        processCommands: [],
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('answers changed once a Gradle file sets its level', async () => {
    const platform = await createPlatformUnit();
    await writeFile(platform.gradlePath, 'android {\n  compileSdk 34\n}\n');

    expect(
      await recheckExplorePathUnit({
        unit: platform.unit,
        environment: environment,
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers busy while an emulator runs', async () => {
    const platform = await createPlatformUnit();

    expect(
      await recheckExplorePathUnit({
        unit: platform.unit,
        environment: environment,
        processCommands: [ANDROID_EMULATOR_PROCESS_COMMAND],
      }),
    ).toEqual({ kind: 'busy' });
  });

  test('fails on an unreadable platforms folder', async () => {
    const platform = await createPlatformUnit();
    await chmod(buildPlatformsPath(), 0o000);

    try {
      expect(
        await recheckExplorePathUnit({
          unit: platform.unit,
          environment: environment,
          processCommands: [],
        }),
      ).toEqual({
        kind: 'failed',
        failure: {
          reason: 'fileUnreadable',
          path: buildPlatformsPath(),
          failure: { reason: 'permissionDenied', code: 'EACCES' },
        },
      });
    } finally {
      await chmod(buildPlatformsPath(), 0o755);
    }
  });
});
