import { afterEach, beforeEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { loadAndroidSystemImageFindings } from '../../src/explore/android/loadAndroidProbeFindings.js';
import { loadAndroidSdkRoots } from '../../src/explore/android/loadAndroidSdkRoots.js';
import {
  parseAndroidLocalPropertiesSdkDir,
  parseFlutterSettingsAndroidSdk,
} from '../../src/explore/android/parseAndroidSdkRootTexts.js';
import type { ProjectPinFile } from '../../src/explore/projectPins/projectPins.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { FLUTTER_SETTINGS_PATHS } from '../../src/platform/darwin/androidSdkRoot.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import {
  ANDROID_RECENT_USE_MS,
  ANDROID_UNUSED_CUTOFF_MS,
  buildAndroidImageSysdir,
  buildAndroidPackageXml,
  buildAndroidSdkRoot,
  writeAndroidAvd,
} from './androidFixtures.js';
import { buildTestPinFileText, buildTestProjectPins } from './projectPinsFixtures.js';

describeAwaitingWin32Platform('parseAndroidLocalPropertiesSdkDir', () => {
  test('reads the last sdk.dir with its escapes undone and skips comments', () => {
    expect(
      parseAndroidLocalPropertiesSdkDir({
        text: '# sdk.dir=/commented\nsdk.dir=/first\nflutter.sdk=/opt/flutter\nsdk.dir = /Users/example/Android\\ SDK\n',
      }),
    ).toBe('/Users/example/Android SDK');
    expect(
      parseAndroidLocalPropertiesSdkDir({ text: 'sdk.dir\\:x=/no\nndk.dir=/ndk\n' }),
    ).toBeNull();
  });
});

describeAwaitingWin32Platform('parseFlutterSettingsAndroidSdk', () => {
  test('reads the android-sdk string of the JSON settings', () => {
    expect(
      parseFlutterSettingsAndroidSdk({ text: '{\n  "android-sdk": "/opt/android-sdk"\n}\n' }),
    ).toBe('/opt/android-sdk');
    for (const text of ['{"android-sdk": 3}', '{}', '[]', 'not json']) {
      expect(parseFlutterSettingsAndroidSdk({ text: text })).toBeNull();
    }
  });
});

describeAwaitingWin32Platform('loadAndroidSdkRoots', () => {
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
    return buildTestAbsolutePath({ text: join(fixtureRoot.rootDir, name) });
  }

  function buildPlatformSdkPath(): AbsolutePath {
    return buildTestAbsolutePath({ text: buildAndroidSdkRoot({ homeDir: fixtureRoot.homeDir }) });
  }

  async function writeFlutterSettings(params: { pathNames: string[]; text: string }) {
    await writeFixtureTextFile({
      path: join(fixtureRoot.homeDir, ...params.pathNames),
      text: params.text,
    });
  }

  function buildLocalProperties(sdkDir: string): ProjectPinFile {
    return buildTestPinFileText({
      path: join(fixtureRoot.homeDir, 'code', 'app', 'android', 'local.properties'),
      kind: 'androidLocalProperties',
      text: `sdk.dir=${sdkDir}\n`,
    });
  }

  function loadRoots(files: ProjectPinFile[]) {
    return loadAndroidSdkRoots({
      pathRules: DARWIN_PATH_RULES,
      homeDir: environment.homeDir,
      androidSdkRoot: ['Library', 'Android', 'sdk'],
      flutterSettingsPaths: FLUTTER_SETTINGS_PATHS,
      projectPins: buildTestProjectPins({ files: files }),
      privacyDenialCode: null,
    });
  }

  testOnPosix('takes the platform SDK, the Flutter one, then local.properties', async () => {
    const platformSdk = buildPlatformSdkPath();
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
      value: [platformSdk, buildSdkPath('flutter-sdk'), buildSdkPath('project-sdk')],
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
      value: [buildSdkPath('legacy-sdk')],
    });

    await rm(join(fixtureRoot.homeDir, '.flutter_settings'));

    expect(await loadRoots([])).toEqual({
      kind: 'succeeded',
      value: [buildSdkPath('config-sdk')],
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

  testOnPosix('offers the unused system images of a second SDK a project names', async () => {
    const platformSdk = buildPlatformSdkPath();
    const projectSdk = buildSdkPath('project-sdk');
    const usedSysdir = buildAndroidImageSysdir({ platform: 'android-35', abi: 'arm64-v8a' });

    for (const sdkRoot of [platformSdk, projectSdk]) {
      await writeFixtureTextFile({
        path: join(sdkRoot, usedSysdir, 'package.xml'),
        text: buildAndroidPackageXml({
          packagePath: 'system-images;android-35;google_apis;arm64-v8a',
        }),
      });
    }

    const unusedFolder = buildTestAbsolutePath({
      text: join(projectSdk, 'system-images', 'android-34', 'google_apis', 'arm64-v8a'),
    });
    await writeFixtureTextFile({
      path: join(unusedFolder, 'package.xml'),
      text: buildAndroidPackageXml({
        packagePath: 'system-images;android-34;google_apis;arm64-v8a',
      }),
    });
    await writeAndroidAvd({
      homeDir: fixtureRoot.homeDir,
      name: 'Pixel',
      imageSysdir: usedSysdir,
      lastUsedAtMs: ANDROID_RECENT_USE_MS,
    });

    const result = await loadAndroidSystemImageFindings({
      run: {
        environment: environment,
        platform: buildTestProbePlatform(),
        processCommands: [],
        deadlineMs: Date.now() + 10_000,
        unusedCutoffMs: ANDROID_UNUSED_CUTOFF_MS,
        staleCutoffMs: 0,
      },
      projectPins: buildTestProjectPins({ files: [buildLocalProperties(projectSdk)] }),
    });

    if (result.kind === 'failed') {
      throw new Error('The system image probe failed.');
    }

    expect(result.value.findings.map((finding) => finding.unit)).toEqual([
      { kind: 'androidSystemImage', sdkRoot: projectSdk, folderPath: unusedFolder },
    ]);
  });
});
