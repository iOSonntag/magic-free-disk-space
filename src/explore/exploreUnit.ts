import type { Risk } from '../catalog/catalog.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { ReadFailure } from '../system/readFailure.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import type { ToolCommandFailure } from '../tools/runToolCommand.js';
import { buildToolArguments } from '../tools/runToolCommand.js';
import type { AndroidAvdName } from './android/parseAndroidAvdName.js';
import type { HomebrewFormulaName } from './homebrew/parseHomebrewFormulaName.js';
import type { MiseToolName, MiseToolVersion } from './miseVersions/parseMisePrunableVersions.js';
import type { SimulatorDeviceUdid } from './simulatorDevices/parseSimulatorDeviceList.js';
import type { SimulatorRuntimeId } from './simulatorRuntimes/parseSimulatorRuntimeId.js';

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

/** An item a developer tool owns and removes with its own command. */
export type ExploreToolUnit =
  | ExploreToolUnitSimulatorDevice
  | ExploreToolUnitDartPubCache
  | ExploreToolUnitMiseVersion
  | ExploreToolUnitSimulatorRuntime
  | ExploreToolUnitAndroidAvd
  | ExploreToolUnitHomebrew;

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
 * An item whose tool has no command for it, so the app deletes its one folder. `folderPath` is the
 * one home of that folder: the candidate's path and the deletion both take it from there.
 */
export type ExplorePathUnit = ExplorePathUnitAndroidPackage | ExplorePathUnitVscodeExtension;

export type ExploreUnit = ExploreToolUnit | ExplorePathUnit;

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
    case 'androidSystemImage':
    case 'androidEmulator':
    case 'vscodeExtension':
      return [unit.folderPath];
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
  }
}

/** The whole argument list the unit's run executes, the tool's leading arguments first. */
export function buildUnitRunArguments(unit: ExploreToolUnit): string[] {
  return buildToolArguments({ name: unit.tool.name, args: buildUnitCommand(unit) });
}
