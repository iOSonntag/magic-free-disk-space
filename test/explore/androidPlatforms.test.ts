import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { buildAndroidPlatformFindings } from '../../src/explore/android/buildAndroidPlatformFindings.js';
import { compareAndroidPlatformUnit } from '../../src/explore/android/compareAndroidPlatformUnit.js';
import type { AndroidPlatformOffers } from '../../src/explore/android/decideAndroidPlatformOffers.js';
import { decideAndroidPlatformOffers } from '../../src/explore/android/decideAndroidPlatformOffers.js';
import type {
  AndroidPlatformSdk,
  AndroidPlatformState,
} from '../../src/explore/android/loadAndroidPlatformState.js';
import type { AndroidCompileSdkPins } from '../../src/explore/android/parseAndroidCompileSdkPins.js';
import { parseAndroidCompileSdkPins } from '../../src/explore/android/parseAndroidCompileSdkPins.js';
import type { ExplorePathUnitAndroidPlatform } from '../../src/explore/exploreUnit.js';
import type {
  ProjectPinFile,
  ProjectPinFileText,
} from '../../src/explore/projectPins/projectPins.js';
import { PINNED_VERSION_REINSTALL_EXPLANATION } from '../../src/explore/projectPins/projectSearchEvidence.js';
import type { ToolPins } from '../../src/explore/projectPins/selectToolPins.js';
import { recheckExplorePathUnit } from '../../src/explore/recheckExploreUnit.js';
import type { ExploreProbeOutcome } from '../../src/explore/startExploreProbes.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import { joinAbsolutePath } from '../../src/path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { POSIX_PATH_RULES } from '../../src/path/pathRules.js';
import { PROJECT_SEARCH_INCOMPLETE_EVIDENCE } from '../../src/platform/darwin/projectSearchEvidence.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import type { HomeFolder } from '../support/parsedValueFixtures.js';
import { buildTestAbsolutePath, joinBelowHome } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';
import {
  ANDROID_EMULATOR_PROCESS_COMMAND,
  ANDROID_UNUSED_CUTOFF_MS,
  buildAndroidSdkRoot,
  createAndroidAvdHome,
  writeAndroidEmulator,
  writeAndroidPlatform,
  writeAndroidSystemImage,
} from './androidFixtures.js';
import { buildTestProbeStart } from './probeStartFixtures.js';
import {
  buildFoundProjectPinsLoad,
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
  return joinAbsolutePath({
    rules: POSIX_PATH_RULES,
    parentPath: EXAMPLE_SDK_ROOT,
    names: ['platforms', folderName],
  });
}

function buildExampleState(): AndroidPlatformState {
  return { sdks: [buildExampleSdk()] };
}

function buildExampleSdk(): AndroidPlatformSdk {
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
        toolPins: buildTextPins('android { compileSdk 35 }\n'),
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
        toolPins: { kind: 'everyVersionPinned' },
      }),
    ).toEqual({ offers: [], isComplete: true });
  });

  test('offers nothing and judges when a file pins every platform', () => {
    expect(
      decideAndroidPlatformOffers({
        state: buildExampleState(),
        toolPins: buildTextPins('android {\n  compileSdk flutter.compileSdkVersion\n}\n'),
      }),
    ).toEqual({ offers: [], isComplete: true });
  });

  test('leaves an extension platform not judged when a file pins every platform', () => {
    const sdk = buildExampleSdk();
    const state: AndroidPlatformState = { sdks: [sdk] };
    sdk.platforms.push({
      kind: 'parsed',
      folderPath: buildExamplePlatformPath('android-33-ext5'),
      packagePath: 'platforms;android-33-ext5',
    });

    expect(
      decideAndroidPlatformOffers({
        state: state,
        toolPins: buildTextPins('android {\n  compileSdk flutter.compileSdkVersion\n}\n'),
      }),
    ).toEqual({ offers: [], isComplete: false });
  });

  test('leaves an extension platform, a preview, and an unparsed folder not judged', () => {
    const sdk = buildExampleSdk();
    const state: AndroidPlatformState = { sdks: [sdk] };
    sdk.platforms.push(
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
        toolPins: buildTextPins('android { compileSdk 34 }\n', 'android { compileSdk 35 }\n'),
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
        pinFiles: [{ path: buildTestAbsolutePath({ text: EXAMPLE_GRADLE_PATH }), kind: 'gradle' }],
        projectPins: buildTestProjectPins({ files: [] }),
        runningProcesses: buildRunningCommandLines([]),
        projectSearchIncompleteEvidence: PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
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
      pinFiles: [],
      projectPins: buildTestProjectPins({ files: [], isWalkComplete: false }),
      runningProcesses: buildRunningCommandLines([ANDROID_EMULATOR_PROCESS_COMMAND]),
      projectSearchIncompleteEvidence: PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
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
        toolPins: buildTextPins('android { compileSdk 35 }\n'),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('answers changed once a Gradle file sets its level', () => {
    expect(
      compareAndroidPlatformUnit({
        unit: unit,
        state: buildExampleState(),
        toolPins: buildTextPins('android { compileSdk 34 }\n'),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers changed once the folder is gone', () => {
    expect(
      compareAndroidPlatformUnit({
        unit: unit,
        state: { sdks: [{ sdkRoot: EXAMPLE_SDK_ROOT, platforms: [] }] },
        toolPins: buildTextPins(),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers busy while an emulator runs or the processes are unknown', () => {
    for (const runningProcesses of [
      buildRunningCommandLines([ANDROID_EMULATOR_PROCESS_COMMAND]),
      null,
    ]) {
      expect(
        compareAndroidPlatformUnit({
          unit: unit,
          state: buildExampleState(),
          toolPins: buildTextPins(),
          runningProcesses: runningProcesses,
        }),
      ).toEqual({ kind: 'busy' });
    }
  });
});

let fixtureRoot: FixtureRoot;
let environment: Environment;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

function buildPlatformsPath(): string {
  return join(buildAndroidSdkRoot({ folders: environment }), 'platforms');
}

type AndroidProbeOutcomes = {
  platforms: ExploreProbeOutcome;
  systemImages: ExploreProbeOutcome;
  emulator: ExploreProbeOutcome;
};

async function loadAndroidProbeOutcomes(params: {
  pinFiles: ProjectPinFile[];
}): Promise<AndroidProbeOutcomes> {
  const probes = startExploreProbes(
    buildTestProbeStart({
      environment: environment,
      projectPins: buildFoundProjectPinsLoad({ files: params.pinFiles }),
      unusedCutoffMs: ANDROID_UNUSED_CUTOFF_MS,
    }),
  );

  return {
    platforms: await probes.outcomes.androidPlatforms,
    systemImages: await probes.outcomes.androidSystemImages,
    emulator: await probes.outcomes.androidEmulator,
  };
}

function buildHomeGradlePath(params: { home: HomeFolder }): AbsolutePath {
  return joinBelowHome({ home: params.home, path: 'code/app/build.gradle' });
}

function buildHomeGradlePin(params: { home: HomeFolder; text: string }): ProjectPinFile {
  return buildTestPinFileText({
    path: buildHomeGradlePath({ home: params.home }),
    kind: 'gradle',
    text: params.text,
  });
}

describe('startExploreProbes with the Android platform probe', () => {
  test('offers the platform no Gradle file pins', async () => {
    const unpinnedPath = await writeAndroidPlatform({
      folders: environment,
      folderName: 'android-34',
    });
    await writeAndroidPlatform({ folders: environment, folderName: 'android-35' });

    const outcomes = await loadAndroidProbeOutcomes({
      pinFiles: [
        buildHomeGradlePin({ home: environment, text: 'android {\n  compileSdk 35\n}\n' }),
      ],
    });

    expect(outcomes.platforms).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: {
            kind: 'androidPlatform',
            sdkRoot: buildAndroidSdkRoot({ folders: environment }),
            folderPath: unpinnedPath,
            apiLevel: 34,
            pinFiles: [{ path: buildHomeGradlePath({ home: environment }), kind: 'gradle' }],
          },
          risk: 'careful',
          activity: 'idle',
        }),
      ],
      isComplete: true,
    });
  });

  test('offers nothing when every platform is pinned', async () => {
    await writeAndroidPlatform({ folders: environment, folderName: 'android-34' });
    await writeAndroidPlatform({ folders: environment, folderName: 'android-35' });

    const outcomes = await loadAndroidProbeOutcomes({
      pinFiles: [
        buildHomeGradlePin({ home: environment, text: 'android { compileSdk 34 }\n' }),
        buildTestPinFileText({
          path: joinBelowHome({ home: environment, path: 'code/other/build.gradle.kts' }),
          kind: 'gradle',
          text: 'android {\n  compileSdk = 35\n}\n',
        }),
      ],
    });

    expect(outcomes.platforms).toEqual({ kind: 'probed', findings: [], isComplete: true });
  });

  test('offers nothing and judges when a pin pins every platform', async () => {
    await writeAndroidPlatform({ folders: environment, folderName: 'android-34' });

    for (const pinFile of [
      buildHomeGradlePin({
        home: environment,
        text: 'android {\n  compileSdkVersion flutter.compileSdkVersion\n}\n',
      }),
      buildTestPinFileUnfit({
        path: buildHomeGradlePath({ home: environment }),
        kind: 'gradle',
      }),
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
    await writeAndroidPlatform({ folders: environment, folderName: 'android-33-ext5' });

    expect((await loadAndroidProbeOutcomes({ pinFiles: [] })).platforms).toEqual({
      kind: 'probed',
      findings: [],
      isComplete: false,
    });
  });

  testOnPosix(
    'answers unreadable on the platforms folder and leaves the other Android probes judged',
    async () => {
      await writeAndroidPlatform({ folders: environment, folderName: 'android-34' });
      await writeAndroidSystemImage({
        sdkRoot: buildAndroidSdkRoot({ folders: environment }),
        platform: 'android-35',
        abi: 'arm64-v8a',
      });
      await writeAndroidEmulator({ folders: environment });
      await createAndroidAvdHome({ home: environment });
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
    },
  );

  test('answers unreadable on an unreadable Gradle file', async () => {
    await writeAndroidPlatform({ folders: environment, folderName: 'android-34' });
    const gradlePath = buildHomeGradlePath({ home: environment });

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
    gradlePath: AbsolutePath;
  }> {
    const folderPath = await writeAndroidPlatform({
      folders: environment,
      folderName: 'android-34',
    });
    const gradlePath = buildHomeGradlePath({ home: environment });
    await writeFixtureTextFile({ path: gradlePath, text: 'android {\n  compileSdk 35\n}\n' });

    return {
      unit: {
        kind: 'androidPlatform',
        sdkRoot: buildAndroidSdkRoot({ folders: environment }),
        folderPath: folderPath,
        apiLevel: 34,
        pinFiles: [{ path: gradlePath, kind: 'gradle' }],
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
        platform: buildTestProbePlatform(),
        runningProcesses: buildRunningCommandLines([]),
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
        platform: buildTestProbePlatform(),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers busy while an emulator runs', async () => {
    const platform = await createPlatformUnit();

    expect(
      await recheckExplorePathUnit({
        unit: platform.unit,
        environment: environment,
        platform: buildTestProbePlatform(),
        runningProcesses: buildRunningCommandLines([ANDROID_EMULATOR_PROCESS_COMMAND]),
      }),
    ).toEqual({ kind: 'busy' });
  });

  testOnPosix('fails on an unreadable platforms folder', async () => {
    const platform = await createPlatformUnit();
    await chmod(buildPlatformsPath(), 0o000);

    try {
      expect(
        await recheckExplorePathUnit({
          unit: platform.unit,
          environment: environment,
          platform: buildTestProbePlatform(),
          runningProcesses: buildRunningCommandLines([]),
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
