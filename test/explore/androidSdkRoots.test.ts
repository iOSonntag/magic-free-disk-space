import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, rm } from 'node:fs/promises';
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
import {
  ANDROID_SDK_PATH_NAMES,
  FLUTTER_SETTINGS_PATHS,
} from '../../src/platform/darwin/androidSdkRoot.js';
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
import { buildTestProbeRun } from '../support/probeRunFixtures.js';
import {
  ANDROID_RECENT_USE_MS,
  ANDROID_UNUSED_CUTOFF_MS,
  buildAndroidImageSysdir,
  buildAndroidSdkRoot,
  writeAndroidAvd,
  writeAndroidSystemImage,
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
      androidSdkRoot: ANDROID_SDK_PATH_NAMES,
      flutterSettingsPaths: FLUTTER_SETTINGS_PATHS,
      projectPins: buildTestProjectPins({ files: files }),
      privacyDenialCode: null,
    });
  }

  testOnPosix('takes the platform SDK, the Flutter one, then local.properties', async () => {
    const platformSdk = buildAndroidSdkRoot({ homeDir: fixtureRoot.homeDir });
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

  testOnPosix('adds no SDK for an sdk.dir of local.properties in a locked folder', async () => {
    const platformSdk = buildAndroidSdkRoot({ homeDir: fixtureRoot.homeDir });
    const lockedFolder = buildSdkPath('locked');

    await createFixtureDirectory({ path: platformSdk });
    await createFixtureDirectory({ path: join(lockedFolder, 'sdk') });
    await chmod(lockedFolder, 0o000);

    expect(await loadRoots([buildLocalProperties(join(lockedFolder, 'sdk'))])).toEqual({
      kind: 'succeeded',
      value: [platformSdk],
    });
  });

  testOnPosix('adds no SDK for a Flutter settings file that cannot be read', async () => {
    const platformSdk = buildAndroidSdkRoot({ homeDir: fixtureRoot.homeDir });
    const settingsPath = join(fixtureRoot.homeDir, '.flutter_settings');

    await createFixtureDirectory({ path: platformSdk });
    await writeFlutterSettings({
      pathNames: ['.flutter_settings'],
      text: JSON.stringify({ 'android-sdk': buildSdkPath('flutter-sdk') }),
    });
    await chmod(settingsPath, 0o000);

    expect(await loadRoots([])).toEqual({ kind: 'succeeded', value: [platformSdk] });
  });

  testOnPosix('offers the unused system images of a second SDK a project names', async () => {
    const platformSdk = buildAndroidSdkRoot({ homeDir: fixtureRoot.homeDir });
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
      homeDir: fixtureRoot.homeDir,
      name: 'Pixel',
      imageSysdir: usedSysdir,
      lastUsedAtMs: ANDROID_RECENT_USE_MS,
    });

    const result = await loadAndroidSystemImageFindings({
      run: buildTestProbeRun({ environment: environment, cutoffMs: ANDROID_UNUSED_CUTOFF_MS }),
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
