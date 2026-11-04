import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { AndroidSdkRoot } from '../../src/explore/android/loadAndroidSdkRoots.js';
import { loadAndroidSdkRoots } from '../../src/explore/android/loadAndroidSdkRoots.js';
import {
  parseAndroidLocalPropertiesSdkDir,
  parseFlutterSettingsAndroidSdk,
} from '../../src/explore/android/parseAndroidSdkRootTexts.js';
import type { ExploreFileUnreadable } from '../../src/explore/exploreUnit.js';
import type { ProjectPinsLoad } from '../../src/explore/projectPins/loadProjectPins.js';
import type { ProjectPinFile } from '../../src/explore/projectPins/projectPins.js';
import type { ExploreProbesStarted } from '../../src/explore/startExploreProbes.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import {
  ANDROID_SDK_ROOT,
  FLUTTER_SETTINGS_PATHS,
} from '../../src/platform/darwin/androidSdkRoot.js';
import type { Result } from '../../src/result.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestHostPath } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import {
  ANDROID_RECENT_USE_MS,
  ANDROID_UNUSED_CUTOFF_MS,
  buildAndroidImageSysdir,
  buildAndroidSdkRoot,
  writeAndroidAvd,
  writeAndroidSystemImage,
} from './androidFixtures.js';
import { buildTestProbeStart } from './probeStartFixtures.js';
import {
  buildFoundProjectPinsLoad,
  buildSettledProjectPinsLoad,
  buildTestPinFileText,
} from './projectPinsFixtures.js';

describe('parseAndroidLocalPropertiesSdkDir', () => {
  test('reads the last sdk.dir with its escapes undone and skips comments', () => {
    expect(
      parseAndroidLocalPropertiesSdkDir({
        text: `# sdk.dir=/commented
sdk.dir=/first
flutter.sdk=/opt/flutter
sdk.dir = /Users/example/Android\\ SDK
`,
      }),
    ).toBe('/Users/example/Android SDK');
    expect(
      parseAndroidLocalPropertiesSdkDir({
        text: `sdk.dir\\:x=/no
ndk.dir=/ndk
`,
      }),
    ).toBeNull();
  });

  test('reads the \\uXXXX Android Studio writes past ASCII, and the letter escapes', () => {
    expect(
      parseAndroidLocalPropertiesSdkDir({
        text: 'sdk.dir=/Users/me/D\\u00E9veloppement/android-sdk\n',
      }),
    ).toBe('/Users/me/Développement/android-sdk');
    expect(parseAndroidLocalPropertiesSdkDir({ text: 'sdk.dir=/a\\tb\\\\u0041\n' })).toBe(
      '/a\tb\\u0041',
    );
  });
});

describe('parseFlutterSettingsAndroidSdk', () => {
  test('reads the android-sdk string of the JSON settings', () => {
    expect(
      parseFlutterSettingsAndroidSdk({
        text: `{
  "android-sdk": "/opt/android-sdk"
}
`,
      }),
    ).toBe('/opt/android-sdk');

    for (const text of ['{"android-sdk": 3}', '{}', '[]', 'not json']) {
      expect(parseFlutterSettingsAndroidSdk({ text: text })).toBeNull();
    }
  });
});

describe('loadAndroidSdkRoots', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  function buildSdkPath(name: string): AbsolutePath {
    return buildTestHostPath({ text: join(fixtureRoot.rootDir, name) });
  }

  async function writeFlutterSettings(params: {
    pathNames: string[];
    text: string;
  }): Promise<void> {
    await writeFixtureTextFile({
      path: join(fixtureRoot.homeDir, ...params.pathNames),
      text: params.text,
    });
  }

  function buildLocalProperties(sdkDir: string): ProjectPinFile {
    return buildTestPinFileText({
      path: buildTestHostPath({
        text: join(fixtureRoot.homeDir, 'code', 'app', 'android', 'local.properties'),
      }),
      kind: 'androidLocalProperties',
      text: `sdk.dir=${sdkDir}\n`,
    });
  }

  function loadRoots(
    files: ProjectPinFile[],
  ): Promise<Result<AndroidSdkRoot[], ExploreFileUnreadable>> {
    return loadAndroidSdkRoots({
      environment: environment,
      androidSdkRoot: ANDROID_SDK_ROOT,
      flutterSettingsPaths: FLUTTER_SETTINGS_PATHS,
      pinFiles: files,
      privacyDenialCode: null,
    });
  }

  /** A root other than the platform SDK's, whose failed read leaves it out. */
  function buildOptionalRoot(path: AbsolutePath): AndroidSdkRoot {
    return { path: path, isRequired: false };
  }

  /** The platform SDK's root, the one whose failed read fails the probes. */
  function buildPlatformRoot(): AndroidSdkRoot {
    return { path: buildAndroidSdkRoot({ environment: environment }), isRequired: true };
  }

  /** The probes over the fixture home with `projectPins`, judging use by the Android cutoff. */
  function startAndroidProbes(projectPins: ProjectPinsLoad): ExploreProbesStarted {
    return startExploreProbes(
      buildTestProbeStart({
        environment: environment,
        projectPins: projectPins,
        unusedCutoffMs: ANDROID_UNUSED_CUTOFF_MS,
      }),
    );
  }

  /** An AVD of the platform SDK on `android-35`, and its unused `android-34`; returns the latter. */
  async function writePlatformImages(): Promise<AbsolutePath> {
    const platformSdk = buildPlatformRoot().path;

    await writeAndroidSystemImage({
      sdkRoot: platformSdk,
      platform: 'android-35',
      abi: 'arm64-v8a',
    });
    await writeAndroidAvd({
      environment: environment,
      name: 'Pixel',
      imageSysdir: buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' }),
      lastUsedAtMs: ANDROID_RECENT_USE_MS,
    });

    return writeAndroidSystemImage({
      sdkRoot: platformSdk,
      platform: 'android-34',
      abi: 'arm64-v8a',
    });
  }

  testOnPosix('takes the platform SDK, the Flutter one, then local.properties', async () => {
    const platformSdk = buildPlatformRoot().path;
    await createFixtureDirectory({ path: platformSdk });
    await createFixtureDirectory({ path: buildSdkPath('flutter-sdk') });
    await createFixtureDirectory({ path: buildSdkPath('project-sdk') });
    await writeFlutterSettings({
      pathNames: ['.config', 'flutter', 'settings'],
      text: JSON.stringify({ 'android-sdk': buildSdkPath('flutter-sdk') }),
    });

    expect(
      await loadRoots([
        buildLocalProperties(buildSdkPath('project-sdk')),
        buildLocalProperties(platformSdk),
        buildLocalProperties(buildSdkPath('missing-sdk')),
        buildLocalProperties('relative/sdk'),
      ]),
    ).toEqual({
      kind: 'succeeded',
      value: [
        buildPlatformRoot(),
        buildOptionalRoot(buildSdkPath('flutter-sdk')),
        buildOptionalRoot(buildSdkPath('project-sdk')),
      ],
    });
  });

  testOnPosix('reads ~/.flutter_settings first, then ~/.config/flutter/settings', async () => {
    await createFixtureDirectory({ path: buildSdkPath('legacy-sdk') });
    await createFixtureDirectory({ path: buildSdkPath('config-sdk') });
    await writeFlutterSettings({
      pathNames: ['.flutter_settings'],
      text: JSON.stringify({ 'android-sdk': buildSdkPath('legacy-sdk') }),
    });
    await writeFlutterSettings({
      pathNames: ['.config', 'flutter', 'settings'],
      text: JSON.stringify({ 'android-sdk': buildSdkPath('config-sdk') }),
    });

    expect(await loadRoots([])).toEqual({
      kind: 'succeeded',
      value: [buildOptionalRoot(buildSdkPath('legacy-sdk'))],
    });

    await rm(join(fixtureRoot.homeDir, '.flutter_settings'));

    expect(await loadRoots([])).toEqual({
      kind: 'succeeded',
      value: [buildOptionalRoot(buildSdkPath('config-sdk'))],
    });
  });

  testOnPosix('a legacy settings file without android-sdk hides the newer one', async () => {
    await createFixtureDirectory({ path: buildSdkPath('config-sdk') });
    await writeFlutterSettings({ pathNames: ['.flutter_settings'], text: '{}' });
    await writeFlutterSettings({
      pathNames: ['.config', 'flutter', 'settings'],
      text: JSON.stringify({ 'android-sdk': buildSdkPath('config-sdk') }),
    });

    expect(await loadRoots([])).toEqual({ kind: 'succeeded', value: [] });
  });

  testOnPosix('adds no SDK for an sdk.dir of local.properties in a locked folder', async () => {
    const platformSdk = buildPlatformRoot().path;
    const lockedFolder = buildSdkPath('locked');

    await createFixtureDirectory({ path: platformSdk });
    await createFixtureDirectory({ path: join(lockedFolder, 'sdk') });
    await chmod(lockedFolder, 0o000);

    expect(await loadRoots([buildLocalProperties(join(lockedFolder, 'sdk'))])).toEqual({
      kind: 'succeeded',
      value: [buildPlatformRoot()],
    });
  });

  testOnPosix('adds no SDK for a Flutter settings file that cannot be read', async () => {
    const platformSdk = buildPlatformRoot().path;
    const settingsPath = join(fixtureRoot.homeDir, '.flutter_settings');

    await createFixtureDirectory({ path: platformSdk });
    await writeFlutterSettings({
      pathNames: ['.flutter_settings'],
      text: JSON.stringify({ 'android-sdk': buildSdkPath('flutter-sdk') }),
    });
    await chmod(settingsPath, 0o000);

    expect(await loadRoots([])).toEqual({ kind: 'succeeded', value: [buildPlatformRoot()] });
  });

  testOnPosix('offers the unused system images of a second SDK a project names', async () => {
    const platformSdk = buildPlatformRoot().path;
    const projectSdk = buildSdkPath('project-sdk');
    const usedSysdir = buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' });

    for (const sdkRoot of [platformSdk, projectSdk]) {
      await writeAndroidSystemImage({ sdkRoot: sdkRoot, platform: 'android-35', abi: 'arm64-v8a' });
    }

    const unusedFolder = await writeAndroidSystemImage({
      sdkRoot: projectSdk,
      platform: 'android-34',
      abi: 'arm64-v8a',
    });
    await writeAndroidAvd({
      environment: environment,
      name: 'Pixel',
      imageSysdir: usedSysdir,
      lastUsedAtMs: ANDROID_RECENT_USE_MS,
    });

    const probes = startAndroidProbes(
      buildFoundProjectPinsLoad({ files: [buildLocalProperties(projectSdk)] }),
    );

    expect(await probes.outcomes.androidSystemImages).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: { kind: 'androidSystemImage', sdkRoot: projectSdk, folderPath: unusedFolder },
        }),
      ],
      isComplete: true,
    });
  });

  testOnPosix('reads the SDKs of the platform and of Flutter while the pins failed', async () => {
    const unusedFolder = await writePlatformImages();
    const probes = startAndroidProbes(
      buildSettledProjectPinsLoad({
        pins: {
          kind: 'failed',
          failure: {
            reason: 'fileUnreadable',
            path: '/tracked-configs/link',
            failure: { reason: 'permissionDenied', code: 'EACCES' },
          },
        },
      }),
    );

    expect(await probes.outcomes.androidSystemImages).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: {
            kind: 'androidSystemImage',
            sdkRoot: buildPlatformRoot().path,
            folderPath: unusedFolder,
          },
        }),
      ],
      isComplete: true,
    });
    expect((await probes.outcomes.androidEmulator).kind).toBe('probed');
    expect((await probes.outcomes.androidPlatforms).kind).toBe('unreadable');
  });

  testOnPosix("leaves out a project SDK it cannot read, and offers the platform's", async () => {
    const unusedFolder = await writePlatformImages();
    const projectSdk = buildSdkPath('project-sdk');

    for (const folderName of ['system-images', 'platforms']) {
      await createFixtureDirectory({ path: join(projectSdk, folderName) });
      await chmod(join(projectSdk, folderName), 0o000);
    }

    const probes = startAndroidProbes(
      buildFoundProjectPinsLoad({ files: [buildLocalProperties(projectSdk)] }),
    );

    expect(await probes.outcomes.androidSystemImages).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: {
            kind: 'androidSystemImage',
            sdkRoot: buildPlatformRoot().path,
            folderPath: unusedFolder,
          },
        }),
      ],
      isComplete: true,
    });
    expect((await probes.outcomes.androidEmulator).kind).toBe('probed');
    expect((await probes.outcomes.androidPlatforms).kind).toBe('probed');
  });

  testOnPosix('claims the roots of Flutter and of the projects, not the platform SDK', async () => {
    await createFixtureDirectory({ path: buildPlatformRoot().path });
    await createFixtureDirectory({ path: buildSdkPath('flutter-sdk') });
    await createFixtureDirectory({ path: buildSdkPath('project-sdk') });
    await writeFlutterSettings({
      pathNames: ['.config', 'flutter', 'settings'],
      text: JSON.stringify({ 'android-sdk': buildSdkPath('flutter-sdk') }),
    });

    const probes = startAndroidProbes(
      buildFoundProjectPinsLoad({ files: [buildLocalProperties(buildSdkPath('project-sdk'))] }),
    );

    expect(await probes.claimRootsLoad).toEqual([
      buildSdkPath('flutter-sdk'),
      buildSdkPath('project-sdk'),
    ]);
  });
});
