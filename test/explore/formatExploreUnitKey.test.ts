import { expect, test } from 'bun:test';
import type { ExploreUnit } from '../../src/explore/exploreUnit.js';
import { formatExploreUnitKey } from '../../src/explore/formatExploreUnitKey.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestAbsolutePath,
  buildTestAndroidAvdName,
  buildTestAsdfToolName,
  buildTestAsdfToolVersion,
  buildTestHomebrewFormulaName,
  buildTestMiseToolName,
  buildTestMiseToolVersion,
  buildTestNvmNodeVersion,
  buildTestPnpmStoreVersion,
  buildTestSimulatorRuntimeId,
  buildTestUdid,
} from '../support/parsedValueFixtures.js';

const TOOL: LocatedTool = { name: 'xcrun', path: '/fixture/bin/xcrun' };

const SDK_ROOT = buildTestAbsolutePath({ text: '/fixture/sdk' });

function buildFolder(params: { text: string }) {
  return buildTestAbsolutePath({ text: `/fixture/${params.text}` });
}

/** One unit of every kind, with the key it must keep from scan to scan. */
const UNIT_KEYS: { unit: ExploreUnit; key: string }[] = [
  {
    unit: {
      kind: 'simulatorDevice',
      tool: TOOL,
      udid: buildTestUdid({ text: '0A1B2C3D-0000-4000-8000-000000000001' }),
      dataPath: buildFolder({ text: 'device' }),
    },
    key: 'simulatorDevice:0A1B2C3D-0000-4000-8000-000000000001',
  },
  {
    unit: { kind: 'dartPubCache', tool: TOOL, gcPaths: [buildFolder({ text: 'pub/a-1.0.0' })] },
    key: 'dartPubCache',
  },
  {
    unit: {
      kind: 'miseVersion',
      tool: TOOL,
      miseToolName: buildTestMiseToolName({ text: 'node' }),
      version: buildTestMiseToolVersion({ text: '20.1.0' }),
      installPath: buildFolder({ text: 'mise/node/20.1.0' }),
    },
    key: 'miseVersion:node@20.1.0',
  },
  {
    unit: {
      kind: 'simulatorRuntime',
      tool: TOOL,
      runtimeId: buildTestSimulatorRuntimeId({ text: '0A1B2C3D-0000-4000-8000-000000000002' }),
      runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-2',
      imagePath: buildFolder({ text: 'runtime' }),
      lastUsedAtMs: 1,
    },
    key: 'simulatorRuntime:0A1B2C3D-0000-4000-8000-000000000002',
  },
  {
    unit: {
      kind: 'androidAvd',
      tool: TOOL,
      sdkRoot: SDK_ROOT,
      name: buildTestAndroidAvdName({ text: 'Pixel_8' }),
      avdPath: buildFolder({ text: 'avd/Pixel_8.avd' }),
      iniPath: buildFolder({ text: 'avd/Pixel_8.ini' }),
      lastUsedAtMs: 1,
    },
    key: 'androidAvd:Pixel_8',
  },
  {
    unit: {
      kind: 'homebrewOldVersions',
      tool: TOOL,
      formula: buildTestHomebrewFormulaName({ text: 'wget' }),
      kegPaths: [buildFolder({ text: 'Cellar/wget/1.0' })],
    },
    key: 'homebrewOldVersions:wget',
  },
  {
    unit: {
      kind: 'homebrewOrphans',
      tool: TOOL,
      formulae: [
        buildTestHomebrewFormulaName({ text: 'gettext' }),
        buildTestHomebrewFormulaName({ text: 'libidn2' }),
      ],
      rackPaths: [buildFolder({ text: 'Cellar/gettext' }), buildFolder({ text: 'Cellar/libidn2' })],
    },
    key: 'homebrewOrphans:gettext,libidn2',
  },
  {
    unit: {
      kind: 'asdfVersion',
      tool: TOOL,
      asdfToolName: buildTestAsdfToolName({ text: 'ruby' }),
      version: buildTestAsdfToolVersion({ text: '3.3.0' }),
      installPath: buildFolder({ text: 'asdf/ruby/3.3.0' }),
      pinFiles: [],
    },
    key: 'asdfVersion:ruby@3.3.0',
  },
  {
    unit: {
      kind: 'androidSystemImage',
      sdkRoot: SDK_ROOT,
      folderPath: buildFolder({ text: 'sdk/system-images/android-34' }),
    },
    key: 'androidSystemImage:/fixture/sdk/system-images/android-34',
  },
  {
    unit: {
      kind: 'androidEmulator',
      sdkRoot: SDK_ROOT,
      folderPath: buildFolder({ text: 'sdk/emulator' }),
    },
    key: 'androidEmulator:/fixture/sdk/emulator',
  },
  {
    unit: {
      kind: 'vscodeExtension',
      folderPath: buildFolder({ text: 'extensions/example.alpha-1.0.0' }),
      extensionId: 'example.alpha',
      version: '1.0.0',
      reason: 'obsolete',
    },
    key: 'vscodeExtension:/fixture/extensions/example.alpha-1.0.0',
  },
  {
    unit: {
      kind: 'nvmVersion',
      folderPath: buildFolder({ text: 'nvm/v18.0.0' }),
      version: buildTestNvmNodeVersion({ text: 'v18.0.0' }),
      pinFiles: [],
    },
    key: 'nvmVersion:/fixture/nvm/v18.0.0',
  },
  {
    unit: {
      kind: 'androidPlatform',
      sdkRoot: SDK_ROOT,
      folderPath: buildFolder({ text: 'sdk/platforms/android-33' }),
      apiLevel: 33,
      pinFiles: [],
    },
    key: 'androidPlatform:/fixture/sdk/platforms/android-33',
  },
  {
    unit: {
      kind: 'pnpmStore',
      storeRoot: buildFolder({ text: 'pnpm-store' }),
      folderPath: buildFolder({ text: 'pnpm-store/v3' }),
      storeVersion: buildTestPnpmStoreVersion({ text: 'v3' }),
      pinFiles: [],
    },
    key: 'pnpmStore:/fixture/pnpm-store/v3',
  },
];

describeAwaitingWin32Platform('formatExploreUnitKey', () => {
  test('names a tool unit by what its tool knows it by, and a path unit by its folder', () => {
    expect(UNIT_KEYS.map(({ unit }) => formatExploreUnitKey({ unit: unit }))).toEqual(
      UNIT_KEYS.map(({ key }) => key),
    );
  });

  test('gives every kind of unit a key of its own', () => {
    const keys = UNIT_KEYS.map(({ unit }) => formatExploreUnitKey({ unit: unit }));

    expect(new Set(keys).size).toBe(keys.length);
  });
});
