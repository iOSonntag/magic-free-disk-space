import type { EngineProbeId, Risk } from '../catalog/catalog.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { ReadFailure } from '../system/readFailure.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import type { ToolCommandFailure } from '../tools/runToolCommand.js';
import { buildToolArguments } from '../tools/runToolCommand.js';
import type { AndroidAvdName } from './android/parseAndroidAvdName.js';
import type { AsdfToolName, AsdfToolVersion } from './asdfVersions/parseAsdfInstallNames.js';
import type {
  EngineBuildRecordId,
  EngineContainerId,
  EngineImageId,
  EngineVolumeName,
} from './engines/engineObjectIds.js';
import type { BrowserFamily } from './explorePlatform.js';
import type { HomebrewFormulaName } from './homebrew/parseHomebrewFormulaName.js';
import type { MiseToolName, MiseToolVersion } from './miseVersions/parseMisePrunableVersions.js';
import type { NvmNodeVersion } from './nvmVersions/parseNvmNodeVersion.js';
import type { PnpmStoreVersion } from './pnpmStores/parsePnpmStoreVersion.js';
import type { ProjectPinFileRef } from './projectPins/projectPins.js';
import type { RustupToolchainName } from './rustupToolchains/rustupToolchainName.js';
import type { SimulatorDeviceUdid } from './simulatorDevices/parseSimulatorDeviceList.js';
import type { SimulatorRuntimeId } from './simulatorRuntimes/parseSimulatorRuntimeId.js';
import type {
  VagrantBoxName,
  VagrantBoxProvider,
  VagrantBoxVersion,
} from './vagrantBoxes/vagrantBoxNames.js';

export type ExploreToolUnitSimulatorDevice = {
  kind: 'simulatorDevice';
  tool: LocatedTool;
  udid: SimulatorDeviceUdid;
  dataPath: AbsolutePath;
};

/** `gcPaths` is the list the dry run would delete; the run goes ahead only on a subset of it. */
export type ExploreToolUnitDartPubCache = {
  kind: 'dartPubCache';
  tool: LocatedTool;
  gcPaths: AbsolutePath[];
};

export type ExploreToolUnitMiseVersion = {
  kind: 'miseVersion';
  tool: LocatedTool;
  miseToolName: MiseToolName;
  version: MiseToolVersion;
  installPath: AbsolutePath;
};

export type ExploreToolUnitSimulatorRuntime = {
  kind: 'simulatorRuntime';
  tool: LocatedTool;
  runtimeId: SimulatorRuntimeId;
  /** Such as `com.apple.CoreSimulator.SimRuntime.iOS-18-2`, the runtime its devices name. */
  runtimeIdentifier: string;
  imagePath: AbsolutePath;
  /** The last use `simctl` reports, which the recheck compares for equality. */
  lastUsedAtMs: number;
};

export type ExploreToolUnitAndroidAvd = {
  kind: 'androidAvd';
  tool: LocatedTool;
  sdkRoot: AbsolutePath;
  name: AndroidAvdName;
  avdPath: AbsolutePath;
  iniPath: AbsolutePath;
  /** The newest mtime of the AVD's last-use files, which the recheck compares for equality. */
  lastUsedAtMs: number;
};

/** The old versions of one formula that `brew cleanup -n` would remove from the tool's Cellar. */
export type ExploreToolUnitHomebrewOldVersions = {
  kind: 'homebrewOldVersions';
  tool: LocatedTool;
  formula: HomebrewFormulaName;
  kegPaths: AbsolutePath[];
};

/**
 * The formulae that `brew autoremove -n` lists, removed together by one `brew autoremove`, with the
 * racks `<cellar>/<formula>` the unit measures.
 */
export type ExploreToolUnitHomebrewOrphans = {
  kind: 'homebrewOrphans';
  tool: LocatedTool;
  formulae: HomebrewFormulaName[];
  rackPaths: AbsolutePath[];
};

/** The units Homebrew removes from its Cellar, which one recheck compares. */
export type ExploreToolUnitHomebrew =
  | ExploreToolUnitHomebrewOldVersions
  | ExploreToolUnitHomebrewOrphans;

/**
 * An installed asdf version that no `.tool-versions` found names. `pinFiles` are the tool's pin
 * files the scan read, which the recheck reads again with their kinds.
 */
export type ExploreToolUnitAsdfVersion = {
  kind: 'asdfVersion';
  tool: LocatedTool;
  asdfToolName: AsdfToolName;
  version: AsdfToolVersion;
  installPath: AbsolutePath;
  pinFiles: ProjectPinFileRef[];
};

/** A version of a Vagrant box that a newer version of the same name and provider outdates. */
export type ExploreToolUnitVagrantBoxVersion = {
  kind: 'vagrantBoxVersion';
  tool: LocatedTool;
  name: VagrantBoxName;
  provider: VagrantBoxProvider;
  version: VagrantBoxVersion;
  /** The version's folder, which the unit measures. */
  versionPath: AbsolutePath;
};

/**
 * An installed toolchain that is not the default and that no `rust-toolchain(.toml)` found pins.
 * `pinFiles` are the pin files the scan read, which the recheck reads again.
 */
export type ExploreToolUnitRustupToolchain = {
  kind: 'rustupToolchain';
  tool: LocatedTool;
  name: RustupToolchainName;
  toolchainPath: AbsolutePath;
  pinFiles: ProjectPinFileRef[];
};

/** The package tarballs that `conda clean --tarballs` would remove. */
export type ExploreToolUnitCondaTarballs = {
  kind: 'condaTarballs';
  tool: LocatedTool;
  tarballPaths: AbsolutePath[];
};

/** The unused package folders that `conda clean --packages` would remove. */
export type ExploreToolUnitCondaPackages = {
  kind: 'condaPackages';
  tool: LocatedTool;
  packagePaths: AbsolutePath[];
};

/** An item a developer tool owns and removes with its own command. */
export type ExploreToolUnit =
  | ExploreToolUnitSimulatorDevice
  | ExploreToolUnitDartPubCache
  | ExploreToolUnitMiseVersion
  | ExploreToolUnitSimulatorRuntime
  | ExploreToolUnitAndroidAvd
  | ExploreToolUnitHomebrew
  | ExploreToolUnitAsdfVersion
  | ExploreToolUnitVagrantBoxVersion
  | ExploreToolUnitRustupToolchain
  | ExploreToolUnitCondaTarballs
  | ExploreToolUnitCondaPackages;

/**
 * The paths a probe found to go, never empty. The scan makes the removal's targets from them once,
 * each with its identity; after that, only the targets are read.
 */
export type ExploreFoundPaths = [AbsolutePath, ...AbsolutePath[]];

/** A file a probe found to go, with the modification time its recheck compares. */
export type ExploreFoundFile = { path: AbsolutePath; modifiedMs: number };

/** The files a probe found to go, never empty; the scan makes the removal's targets from them. */
export type ExploreFoundFiles = [ExploreFoundFile, ...ExploreFoundFile[]];

/** A system image folder of the SDK that no AVD names. */
export type ExplorePathUnitAndroidSystemImage = {
  kind: 'androidSystemImage';
  sdkRoot: AbsolutePath;
  folderPath: AbsolutePath;
};

/** The emulator package of the SDK while no AVD exists. */
export type ExplorePathUnitAndroidEmulator = {
  kind: 'androidEmulator';
  sdkRoot: AbsolutePath;
  folderPath: AbsolutePath;
};

/** A package folder of the Android SDK, offered by the state of its SDK. */
export type ExplorePathUnitAndroidPackage =
  | ExplorePathUnitAndroidSystemImage
  | ExplorePathUnitAndroidEmulator;

/** Why an extension folder is offered: `.obsolete` marks it, or a newer version outdates it. */
export type ExplorePathUnitVscodeExtensionReason = 'obsolete' | 'olderVersion';

/** An extension folder that no registry of VS Code lists. */
export type ExplorePathUnitVscodeExtension = {
  kind: 'vscodeExtension';
  folderPath: AbsolutePath;
  extensionId: string;
  version: string;
  reason: ExplorePathUnitVscodeExtensionReason;
};

/**
 * An nvm node version that neither the default alias nor any `.nvmrc` found resolves to.
 * `pinFiles` are the `.nvmrc` files the scan read, which the recheck reads again.
 */
export type ExplorePathUnitNvmVersion = {
  kind: 'nvmVersion';
  folderPath: AbsolutePath;
  version: NvmNodeVersion;
  pinFiles: ProjectPinFileRef[];
};

/**
 * A platform folder `platforms;android-<apiLevel>` of the SDK that no Gradle file found compiles
 * against. `pinFiles` are the Gradle files the scan read, which the recheck reads again.
 */
export type ExplorePathUnitAndroidPlatform = {
  kind: 'androidPlatform';
  sdkRoot: AbsolutePath;
  folderPath: AbsolutePath;
  apiLevel: number;
  pinFiles: ProjectPinFileRef[];
};

/**
 * A store-version folder of pnpm that neither an installed pnpm nor one a project pins uses.
 * `storeRoot` is the store it lies in, which the recheck reads again with the unit's pin files.
 */
export type ExplorePathUnitPnpmStore = {
  kind: 'pnpmStore';
  storeRoot: AbsolutePath;
  folderPath: AbsolutePath;
  storeVersion: PnpmStoreVersion;
  pinFiles: ProjectPinFileRef[];
};

/** The installers in Downloads unchanged since `cutoffMs`. */
export type ExplorePathUnitDownloadsInstallers = {
  kind: 'downloadsInstallers';
  folderPath: AbsolutePath;
  cutoffMs: number;
  foundFiles: ExploreFoundFiles;
};

/** The partial downloads of one browser family in Downloads unchanged since `cutoffMs`. */
export type ExplorePathUnitDownloadsIncomplete = {
  kind: 'downloadsIncomplete';
  folderPath: AbsolutePath;
  browserFamily: BrowserFamily;
  cutoffMs: number;
  foundFiles: ExploreFoundFiles;
};

/** The attachment copies of Mail that nobody changed since Mail saved them, older than `cutoffMs`. */
export type ExplorePathUnitMailDownloads = {
  kind: 'mailDownloads';
  folderPath: AbsolutePath;
  cutoffMs: number;
  foundFiles: ExploreFoundFiles;
};

/**
 * An Ollama model: its manifest and the blobs no other manifest names. `downloadedAtMs` is the
 * manifest's change time, which Ollama writes last when a pull ends.
 */
export type ExplorePathUnitOllamaModel = {
  kind: 'ollamaModel';
  modelName: string;
  manifestPath: AbsolutePath;
  downloadedAtMs: number | null;
  foundPaths: ExploreFoundPaths;
};

/**
 * What a Hugging Face repository holds for its current revisions. `downloadedAtMs` is the change
 * time of its newest current snapshot folder.
 */
export type ExplorePathUnitHuggingFaceRepository = {
  kind: 'huggingFaceRepository';
  repoPath: AbsolutePath;
  downloadedAtMs: number | null;
  foundPaths: ExploreFoundPaths;
};

/**
 * The snapshots of a Hugging Face repository that no ref names, with the blobs only they link.
 * `downloadedAtMs` is the change time of the newest of these snapshot folders.
 */
export type ExplorePathUnitHuggingFaceDetachedRevisions = {
  kind: 'huggingFaceDetachedRevisions';
  repoPath: AbsolutePath;
  downloadedAtMs: number | null;
  foundPaths: ExploreFoundPaths;
};

/** The unfinished blobs of a Hugging Face repository untouched since `cutoffMs`. */
export type ExplorePathUnitHuggingFacePartialDownloads = {
  kind: 'huggingFacePartialDownloads';
  repoPath: AbsolutePath;
  cutoffMs: number;
  foundPaths: ExploreFoundPaths;
};

/** The transcripts of one Claude Code project older than `cutoffMs`. */
export type ExplorePathUnitClaudeTranscripts = {
  kind: 'claudeTranscripts';
  projectFolderPath: AbsolutePath;
  cutoffMs: number;
  foundPaths: ExploreFoundPaths;
};

/**
 * A Claude Code version that is neither one of the `KEPT_NEWEST_COUNT` newest nor the one
 * `~/.local/bin/claude` runs. `folderPath` is the version's entry in the versions folder, a file or
 * a folder.
 */
export type ExplorePathUnitClaudeCodeVersion = {
  kind: 'claudeCodeVersion';
  folderPath: AbsolutePath;
  version: string;
};

/** Which folder of an IDE version a unit takes; `plugins` lies inside the version's settings. */
export type IdeVersionFolderKind = 'caches' | 'logs' | 'plugins' | 'settings';

/** A folder of an IDE version that a newer version of the same product outdates. */
export type ExplorePathUnitIdeVersionFolder = {
  kind: 'ideVersionFolder';
  product: string;
  version: string;
  folderKind: IdeVersionFolderKind;
  /** The version's folder of its kind, or its settings folder for `plugins`. */
  folderPath: AbsolutePath;
  foundPaths: ExploreFoundPaths;
};

/**
 * One model of LM Studio: a `<publisher>/<model>` folder of its models folder. `downloadedAtMs` is
 * the folder's change time.
 */
export type ExplorePathUnitLmStudioModel = {
  kind: 'lmStudioModel';
  publisher: string;
  modelName: string;
  folderPath: AbsolutePath;
  downloadedAtMs: number | null;
};

/**
 * An FVM Flutter version that is not the global one and that no `.fvmrc` found pins. `pinFiles`
 * are the pin files the scan read, which the recheck reads again.
 */
export type ExplorePathUnitFvmVersion = {
  kind: 'fvmVersion';
  version: string;
  folderPath: AbsolutePath;
  pinFiles: ProjectPinFileRef[];
};

/**
 * An item whose tool has no command for it, so the app deletes its paths. The unit keeps what its
 * recheck and its activity rule judge; what goes is the removal's targets, made from
 * `listUnitPaths` once at the scan.
 */
export type ExplorePathUnit =
  | ExplorePathUnitAndroidPackage
  | ExplorePathUnitVscodeExtension
  | ExplorePathUnitNvmVersion
  | ExplorePathUnitAndroidPlatform
  | ExplorePathUnitPnpmStore
  | ExplorePathUnitDownloadsInstallers
  | ExplorePathUnitDownloadsIncomplete
  | ExplorePathUnitMailDownloads
  | ExplorePathUnitOllamaModel
  | ExplorePathUnitHuggingFaceRepository
  | ExplorePathUnitHuggingFaceDetachedRevisions
  | ExplorePathUnitHuggingFacePartialDownloads
  | ExplorePathUnitClaudeTranscripts
  | ExplorePathUnitClaudeCodeVersion
  | ExplorePathUnitIdeVersionFolder
  | ExplorePathUnitLmStudioModel
  | ExplorePathUnitFvmVersion;

/** A downloaded iCloud file a probe found to evict, with the times its recheck compares. */
export type ExploreFoundEvictFile = { path: AbsolutePath; modifiedMs: number; accessedMs: number };

/** The files a probe found to evict, never empty. */
export type ExploreFoundEvictFiles = [ExploreFoundEvictFile, ...ExploreFoundEvictFile[]];

/**
 * The files of an iCloud Drive folder downloaded and untouched since `cutoffMs`, never empty, which
 * an evict frees while iCloud keeps them. `tool` is the `brctl` the probe located, looked up again
 * before the evict.
 */
export type ExploreEvictUnitIcloudFolder = {
  kind: 'icloudFolder';
  tool: LocatedTool;
  folderPath: AbsolutePath;
  cutoffMs: number;
  foundFiles: ExploreFoundEvictFiles;
};

/** An item whose local copies the system evicts, file by file. */
export type ExploreEvictUnit = ExploreEvictUnitIcloudFolder;

/**
 * Where an engine unit lives: the socket its probe trusted, which every recheck and call goes to
 * alone, the disk image it takes space in, and the size the engine reports for it.
 */
export type ExploreEngineUnitPlace = {
  engineProbeId: EngineProbeId;
  engineName: string;
  socketPath: AbsolutePath;
  diskImagePath: AbsolutePath;
  sizeBytes: number;
};

/** The build cache records of one engine that no build used lately and none uses now. */
export type ExploreEngineUnitBuildCache = ExploreEngineUnitPlace & {
  kind: 'engineBuildCache';
  recordIds: EngineBuildRecordId[];
};

/** The untagged images of one engine that no container uses. */
export type ExploreEngineUnitDanglingImages = ExploreEngineUnitPlace & {
  kind: 'engineDanglingImages';
  imageIds: EngineImageId[];
};

export type ExploreEngineUnitImage = ExploreEngineUnitPlace & {
  kind: 'engineImage';
  imageId: EngineImageId;
};

export type ExploreEngineUnitContainer = ExploreEngineUnitPlace & {
  kind: 'engineContainer';
  containerId: EngineContainerId;
};

export type ExploreEngineUnitVolume = ExploreEngineUnitPlace & {
  kind: 'engineVolume';
  volumeName: EngineVolumeName;
};

/** An item a container engine owns and removes through its API; it has no host path. */
export type ExploreEngineUnit =
  | ExploreEngineUnitBuildCache
  | ExploreEngineUnitDanglingImages
  | ExploreEngineUnitImage
  | ExploreEngineUnitContainer
  | ExploreEngineUnitVolume;

export type ExploreUnit = ExploreToolUnit | ExplorePathUnit | ExploreEvictUnit | ExploreEngineUnit;

/** Whether the unit's tool or app works on it now; `unknown` when the processes could not be read. */
export type UnitActivity = 'idle' | 'busy' | 'unknown';

export type ExploreFinding = {
  unit: ExploreUnit;
  title: string;
  explanation: string;
  regeneration: string;
  risk: Risk;
  evidenceLines: string[];
  displayPath: string;
  activity: UnitActivity;
};

/** What a probe judged; `isComplete` is false when it could not judge some or all of its units. */
export type ExploreProbeFindings = { findings: ExploreFinding[]; isComplete: boolean };

export type ExploreToolFailureCommandFailed = {
  reason: 'commandFailed';
  failure: ToolCommandFailure;
};

export type ExploreToolFailureOutputUnreadable = { reason: 'outputUnreadable'; detail: string };

/** The failure of a command or its output. */
export type ExploreToolFailure =
  | ExploreToolFailureCommandFailed
  | ExploreToolFailureOutputUnreadable;

/** A file that a probe or a recheck could not read, for a reason a place issue reports. */
export type ExploreFileUnreadable = {
  reason: 'fileUnreadable';
  path: string;
  failure: ReadFailure;
};

/** The failure of a tool probe or a tool recheck, which may also read files. */
export type ExploreProbeFailure = ExploreToolFailure | ExploreFileUnreadable;

/**
 * The platform has no place for the probe, such as no iCloud Drive, so it cannot run; the scan
 * treats it as a missing tool, and the entry's advice stands quietly.
 */
export type ExploreProbePlaceMissing = { reason: 'placeMissing' };

/** The paths the unit's removal takes away, measured before and after it; disjoint from catalog items. */
export function listUnitPaths(unit: ExploreUnit): AbsolutePath[] {
  switch (unit.kind) {
    case 'simulatorDevice':
      return [unit.dataPath];
    case 'dartPubCache':
      return unit.gcPaths;
    case 'miseVersion':
      return [unit.installPath];
    case 'simulatorRuntime':
      return [unit.imagePath];
    case 'androidAvd':
      return [unit.avdPath, unit.iniPath];
    case 'homebrewOldVersions':
      return unit.kegPaths;
    case 'homebrewOrphans':
      return unit.rackPaths;
    case 'asdfVersion':
      return [unit.installPath];
    case 'vagrantBoxVersion':
      return [unit.versionPath];
    case 'rustupToolchain':
      return [unit.toolchainPath];
    case 'condaTarballs':
      return unit.tarballPaths;
    case 'condaPackages':
      return unit.packagePaths;
    case 'androidSystemImage':
    case 'androidEmulator':
    case 'vscodeExtension':
    case 'nvmVersion':
    case 'androidPlatform':
    case 'pnpmStore':
    case 'claudeCodeVersion':
    case 'lmStudioModel':
    case 'fvmVersion':
      return [unit.folderPath];
    case 'downloadsInstallers':
    case 'downloadsIncomplete':
    case 'mailDownloads':
    case 'icloudFolder':
      return unit.foundFiles.map((file) => file.path);
    case 'ollamaModel':
    case 'huggingFaceRepository':
    case 'huggingFaceDetachedRevisions':
    case 'huggingFacePartialDownloads':
    case 'claudeTranscripts':
    case 'ideVersionFolder':
      return unit.foundPaths;
    case 'engineBuildCache':
    case 'engineDanglingImages':
    case 'engineImage':
    case 'engineContainer':
    case 'engineVolume':
      return [];
  }
}

/** The ids of what an engine unit removes, as its API names them. */
export function listEngineUnitIds(unit: ExploreEngineUnit): string[] {
  switch (unit.kind) {
    case 'engineBuildCache':
      return unit.recordIds;
    case 'engineDanglingImages':
      return unit.imageIds;
    case 'engineImage':
      return [unit.imageId];
    case 'engineContainer':
      return [unit.containerId];
    case 'engineVolume':
      return [unit.volumeName];
  }
}

/** The arguments that remove the unit, after the tool's fixed leading arguments. */
export function buildUnitCommand(unit: ExploreToolUnit): string[] {
  switch (unit.kind) {
    case 'simulatorDevice':
      return ['simctl', 'delete', unit.udid];
    case 'dartPubCache':
      return ['pub', 'cache', 'gc', '--force'];
    case 'miseVersion':
      return ['uninstall', `${unit.miseToolName}@${unit.version}`];
    case 'simulatorRuntime':
      return ['simctl', 'runtime', 'delete', unit.runtimeId];
    case 'androidAvd':
      return [`--sdk_root=${unit.sdkRoot}`, 'delete', 'avd', '-n', unit.name];
    case 'homebrewOldVersions':
      return ['cleanup', unit.formula];
    case 'homebrewOrphans':
      return ['autoremove'];
    case 'asdfVersion':
      return ['uninstall', unit.asdfToolName, unit.version];
    case 'vagrantBoxVersion':
      return [
        'box',
        'remove',
        unit.name,
        '--provider',
        unit.provider,
        '--box-version',
        unit.version,
      ];
    case 'rustupToolchain':
      return ['toolchain', 'uninstall', unit.name];
    case 'condaTarballs':
      return ['clean', '--tarballs', '--yes'];
    case 'condaPackages':
      return ['clean', '--packages', '--yes'];
  }
}

/** The whole argument list the unit's run executes, the tool's leading arguments first. */
export function buildUnitRunArguments(unit: ExploreToolUnit): string[] {
  return buildToolArguments({ name: unit.tool.name, args: buildUnitCommand(unit) });
}
