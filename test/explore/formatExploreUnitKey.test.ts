import { describe, expect, test } from 'bun:test';
import type { ExploreEngineUnitPlace, ExploreUnit } from '../../src/explore/exploreUnit.js';
import { formatExploreUnitKey } from '../../src/explore/formatExploreUnitKey.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
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
  buildTestRustupToolchainName,
  buildTestSimulatorRuntimeId,
  buildTestUdid,
  buildTestVagrantBoxName,
  buildTestVagrantBoxProvider,
  buildTestVagrantBoxVersion,
} from '../support/parsedValueFixtures.js';
import type { ExploreUnitOfKind } from '../support/probeRunFixtures.js';
import {
  buildBuildRecordId,
  buildContainerId,
  buildImageId,
  buildVolumeName,
} from './engineFixtures.js';

const TOOL: LocatedTool = { name: 'xcrun', path: '/fixture/bin/xcrun' };

const SDK_ROOT = buildTestAbsolutePath({ text: '/fixture/sdk' });

const REPO_PATH = buildFolder({ text: 'hub/models--example-org--example-model' });

const IDE_SETTINGS_PATH = buildFolder({ text: 'JetBrains/IntelliJIdea2024.1' });

const ENGINE_PLACE: ExploreEngineUnitPlace = {
  engineProbeId: 'colimaEngine',
  engineName: 'Colima',
  socketPath: buildFolder({ text: 'colima/default/docker.sock' }),
  diskImagePath: buildFolder({ text: 'colima/_lima/_disks/colima/datadisk' }),
  sizeBytes: 4096,
};

function buildFolder(params: { text: string }): AbsolutePath {
  return buildTestAbsolutePath({ text: `/fixture/${params.text}` });
}

type UnitKeyCase<TKind extends ExploreUnit['kind']> = {
  unit: ExploreUnitOfKind<TKind>;
  key: string;
};

/**
 * One unit of every kind, with the key it must keep from scan to scan; a kind left out fails the
 * build. The three Hugging Face kinds share one repository folder, as one repository's offers do.
 */
const UNIT_KEYS: { [TKind in ExploreUnit['kind']]: UnitKeyCase<TKind> } = {
  simulatorDevice: {
    unit: {
      kind: 'simulatorDevice',
      tool: TOOL,
      udid: buildTestUdid({ text: '0A1B2C3D-0000-4000-8000-000000000001' }),
      dataPath: buildFolder({ text: 'device' }),
    },
    key: 'simulatorDevice:0A1B2C3D-0000-4000-8000-000000000001',
  },
  dartPubCache: {
    unit: { kind: 'dartPubCache', tool: TOOL, gcPaths: [buildFolder({ text: 'pub/a-1.0.0' })] },
    key: 'dartPubCache',
  },
  miseVersion: {
    unit: {
      kind: 'miseVersion',
      tool: TOOL,
      miseToolName: buildTestMiseToolName({ text: 'node' }),
      version: buildTestMiseToolVersion({ text: '20.1.0' }),
      installPath: buildFolder({ text: 'mise/node/20.1.0' }),
    },
    key: 'miseVersion:node@20.1.0',
  },
  simulatorRuntime: {
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
  androidAvd: {
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
  homebrewOldVersions: {
    unit: {
      kind: 'homebrewOldVersions',
      tool: TOOL,
      formula: buildTestHomebrewFormulaName({ text: 'wget' }),
      kegPaths: [buildFolder({ text: 'Cellar/wget/1.0' })],
    },
    key: 'homebrewOldVersions:wget',
  },
  homebrewOrphans: {
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
  asdfVersion: {
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
  vagrantBoxVersion: {
    unit: {
      kind: 'vagrantBoxVersion',
      tool: TOOL,
      name: buildTestVagrantBoxName({ text: 'hashicorp/bionic64' }),
      provider: buildTestVagrantBoxProvider({ text: 'virtualbox' }),
      version: buildTestVagrantBoxVersion({ text: '1.0.0' }),
      versionPath: buildFolder({ text: 'vagrant.d/boxes/hashicorp-VAGRANTSLASH-bionic64/1.0.0' }),
    },
    key: 'vagrantBoxVersion:hashicorp/bionic64/virtualbox@1.0.0',
  },
  rustupToolchain: {
    unit: {
      kind: 'rustupToolchain',
      tool: TOOL,
      name: buildTestRustupToolchainName({ text: 'nightly-aarch64-apple-darwin' }),
      toolchainPath: buildFolder({ text: 'rustup/toolchains/nightly-aarch64-apple-darwin' }),
      pinFiles: [],
    },
    key: 'rustupToolchain:nightly-aarch64-apple-darwin',
  },
  condaTarballs: {
    unit: {
      kind: 'condaTarballs',
      tool: TOOL,
      tarballPaths: [buildFolder({ text: 'miniforge3/pkgs/numpy.conda' })],
    },
    key: 'condaTarballs',
  },
  condaPackages: {
    unit: {
      kind: 'condaPackages',
      tool: TOOL,
      packagePaths: [buildFolder({ text: 'miniforge3/pkgs/numpy' })],
    },
    key: 'condaPackages',
  },
  androidSystemImage: {
    unit: {
      kind: 'androidSystemImage',
      sdkRoot: SDK_ROOT,
      folderPath: buildFolder({ text: 'sdk/system-images/android-34' }),
    },
    key: 'androidSystemImage:/fixture/sdk/system-images/android-34',
  },
  androidEmulator: {
    unit: {
      kind: 'androidEmulator',
      sdkRoot: SDK_ROOT,
      folderPath: buildFolder({ text: 'sdk/emulator' }),
    },
    key: 'androidEmulator:/fixture/sdk/emulator',
  },
  vscodeExtension: {
    unit: {
      kind: 'vscodeExtension',
      folderPath: buildFolder({ text: 'extensions/example.alpha-1.0.0' }),
      extensionId: 'example.alpha',
      version: '1.0.0',
      reason: 'obsolete',
    },
    key: 'vscodeExtension:/fixture/extensions/example.alpha-1.0.0',
  },
  nvmVersion: {
    unit: {
      kind: 'nvmVersion',
      folderPath: buildFolder({ text: 'nvm/v18.0.0' }),
      version: buildTestNvmNodeVersion({ text: 'v18.0.0' }),
      pinFiles: [],
    },
    key: 'nvmVersion:/fixture/nvm/v18.0.0',
  },
  androidPlatform: {
    unit: {
      kind: 'androidPlatform',
      sdkRoot: SDK_ROOT,
      folderPath: buildFolder({ text: 'sdk/platforms/android-33' }),
      apiLevel: 33,
      pinFiles: [],
    },
    key: 'androidPlatform:/fixture/sdk/platforms/android-33',
  },
  pnpmStore: {
    unit: {
      kind: 'pnpmStore',
      storeRoot: buildFolder({ text: 'pnpm-store' }),
      folderPath: buildFolder({ text: 'pnpm-store/v3' }),
      storeVersion: buildTestPnpmStoreVersion({ text: 'v3' }),
      pinFiles: [],
    },
    key: 'pnpmStore:/fixture/pnpm-store/v3',
  },
  downloadsInstallers: {
    unit: {
      kind: 'downloadsInstallers',
      folderPath: buildFolder({ text: 'Downloads' }),
      cutoffMs: 1,
      foundFiles: [{ path: buildFolder({ text: 'Downloads/Old.dmg' }), modifiedMs: 1 }],
    },
    key: 'downloadsInstallers:/fixture/Downloads',
  },
  downloadsIncomplete: {
    unit: {
      kind: 'downloadsIncomplete',
      folderPath: buildFolder({ text: 'Downloads' }),
      browserFamily: 'firefox',
      cutoffMs: 1,
      foundFiles: [{ path: buildFolder({ text: 'Downloads/Big.iso.part' }), modifiedMs: 1 }],
    },
    key: 'downloadsIncomplete:firefox:/fixture/Downloads',
  },
  mailDownloads: {
    unit: {
      kind: 'mailDownloads',
      folderPath: buildFolder({ text: 'Mail Downloads' }),
      cutoffMs: 1,
      foundFiles: [{ path: buildFolder({ text: 'Mail Downloads/A1/saved.pdf' }), modifiedMs: 1 }],
    },
    key: 'mailDownloads:/fixture/Mail Downloads',
  },
  ollamaModel: {
    unit: {
      kind: 'ollamaModel',
      modelName: 'llama3:8b',
      manifestPath: buildFolder({ text: 'ollama/models/manifests/llama3/8b' }),
      downloadedAtMs: 1,
      foundPaths: [buildFolder({ text: 'ollama/models/manifests/llama3/8b' })],
    },
    key: 'ollamaModel:/fixture/ollama/models/manifests/llama3/8b',
  },
  huggingFaceRepository: {
    unit: {
      kind: 'huggingFaceRepository',
      repoPath: REPO_PATH,
      downloadedAtMs: 1,
      foundPaths: [buildFolder({ text: 'hub/models--example-org--example-model/refs' })],
    },
    key: 'huggingFaceRepository:/fixture/hub/models--example-org--example-model',
  },
  huggingFaceDetachedRevisions: {
    unit: {
      kind: 'huggingFaceDetachedRevisions',
      repoPath: REPO_PATH,
      downloadedAtMs: 1,
      foundPaths: [buildFolder({ text: 'hub/models--example-org--example-model/snapshots/b' })],
    },
    key: 'huggingFaceDetachedRevisions:/fixture/hub/models--example-org--example-model',
  },
  huggingFacePartialDownloads: {
    unit: {
      kind: 'huggingFacePartialDownloads',
      repoPath: REPO_PATH,
      cutoffMs: 1,
      foundPaths: [
        buildFolder({ text: 'hub/models--example-org--example-model/blobs/a.incomplete' }),
      ],
    },
    key: 'huggingFacePartialDownloads:/fixture/hub/models--example-org--example-model',
  },
  claudeTranscripts: {
    unit: {
      kind: 'claudeTranscripts',
      projectFolderPath: buildFolder({ text: 'claude/projects/-example' }),
      cutoffMs: 1,
      foundPaths: [buildFolder({ text: 'claude/projects/-example/session.jsonl' })],
    },
    key: 'claudeTranscripts:/fixture/claude/projects/-example',
  },
  claudeCodeVersion: {
    unit: {
      kind: 'claudeCodeVersion',
      folderPath: buildFolder({ text: 'claude/versions/2.0.1' }),
      version: '2.0.1',
    },
    key: 'claudeCodeVersion:/fixture/claude/versions/2.0.1',
  },
  ideVersionFolder: {
    unit: {
      kind: 'ideVersionFolder',
      product: 'IntelliJIdea',
      version: '2024.1',
      folderKind: 'settings',
      folderPath: IDE_SETTINGS_PATH,
      foundPaths: [IDE_SETTINGS_PATH],
    },
    key: 'ideVersionFolder:settings:/fixture/JetBrains/IntelliJIdea2024.1',
  },
  lmStudioModel: {
    unit: {
      kind: 'lmStudioModel',
      publisher: 'example-org',
      modelName: 'example-model',
      folderPath: buildFolder({ text: 'lmstudio/models/example-org/example-model' }),
      downloadedAtMs: 1,
    },
    key: 'lmStudioModel:/fixture/lmstudio/models/example-org/example-model',
  },
  fvmVersion: {
    unit: {
      kind: 'fvmVersion',
      version: '3.19.0',
      folderPath: buildFolder({ text: 'fvm/versions/3.19.0' }),
      pinFiles: [],
    },
    key: 'fvmVersion:/fixture/fvm/versions/3.19.0',
  },
  icloudFolder: {
    unit: {
      kind: 'icloudFolder',
      tool: TOOL,
      folderPath: buildFolder({ text: 'Mobile Documents/com~apple~CloudDocs/Projects' }),
      cutoffMs: 1,
      foundFiles: [
        {
          path: buildFolder({ text: 'Mobile Documents/com~apple~CloudDocs/Projects/old.txt' }),
          modifiedMs: 1,
          accessedMs: 1,
        },
      ],
    },
    key: 'icloudFolder:/fixture/Mobile Documents/com~apple~CloudDocs/Projects',
  },
  engineBuildCache: {
    unit: { ...ENGINE_PLACE, kind: 'engineBuildCache', recordIds: [buildBuildRecordId('1')] },
    key: 'engineBuildCache:colimaEngine:/fixture/colima/default/docker.sock',
  },
  engineDanglingImages: {
    unit: { ...ENGINE_PLACE, kind: 'engineDanglingImages', imageIds: [buildImageId('1')] },
    key: 'engineDanglingImages:colimaEngine:/fixture/colima/default/docker.sock',
  },
  engineImage: {
    unit: { ...ENGINE_PLACE, kind: 'engineImage', imageId: buildImageId('2') },
    key: `engineImage:colimaEngine:/fixture/colima/default/docker.sock:sha256:${'2'.repeat(64)}`,
  },
  engineContainer: {
    unit: { ...ENGINE_PLACE, kind: 'engineContainer', containerId: buildContainerId('3') },
    key: `engineContainer:colimaEngine:/fixture/colima/default/docker.sock:${'3'.repeat(64)}`,
  },
  engineVolume: {
    unit: { ...ENGINE_PLACE, kind: 'engineVolume', volumeName: buildVolumeName('data') },
    key: 'engineVolume:colimaEngine:/fixture/colima/default/docker.sock:data',
  },
};

/** Units of one kind that share their place, which a scan offers side by side. */
const NEIGHBOUR_UNIT_KEYS: { unit: ExploreUnit; key: string }[] = [
  // The plugins of an IDE version lie in its settings folder and name the same folder.
  {
    unit: { ...UNIT_KEYS.ideVersionFolder.unit, folderKind: 'plugins' },
    key: 'ideVersionFolder:plugins:/fixture/JetBrains/IntelliJIdea2024.1',
  },
  // A second Colima profile runs its own engine behind its own socket.
  {
    unit: {
      ...UNIT_KEYS.engineBuildCache.unit,
      socketPath: buildFolder({ text: 'colima/work/docker.sock' }),
    },
    key: 'engineBuildCache:colimaEngine:/fixture/colima/work/docker.sock',
  },
];

const ALL_UNIT_KEYS: { unit: ExploreUnit; key: string }[] = [
  ...Object.values(UNIT_KEYS),
  ...NEIGHBOUR_UNIT_KEYS,
];

describe('formatExploreUnitKey', () => {
  test('names a tool unit by what its tool knows it by, and a path unit by its folder', () => {
    expect(ALL_UNIT_KEYS.map((unitKey) => formatExploreUnitKey({ unit: unitKey.unit }))).toEqual(
      ALL_UNIT_KEYS.map((unitKey) => unitKey.key),
    );
  });

  test('gives every unit a key of its own, those that share a folder or a repository too', () => {
    const keys = ALL_UNIT_KEYS.map((unitKey) => formatExploreUnitKey({ unit: unitKey.unit }));

    expect(new Set(keys).size).toBe(keys.length);
  });
});
