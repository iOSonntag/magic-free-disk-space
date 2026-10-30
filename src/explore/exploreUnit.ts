import type { Risk } from '../catalog/catalog.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import type { ToolCommandFailure } from '../tools/runToolCommand.js';
import { buildToolArguments } from '../tools/runToolCommand.js';
import type { MiseToolName, MiseToolVersion } from './miseVersions/parseMisePrunableVersions.js';
import type { SimulatorDeviceUdid } from './simulatorDevices/parseSimulatorDeviceList.js';

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
  toolName: MiseToolName;
  version: MiseToolVersion;
  installPath: AbsolutePath;
};

/** An item a developer tool owns and removes with its own command. */
export type ExploreToolUnit =
  | ExploreToolUnitSimulatorDevice
  | ExploreToolUnitDartPubCache
  | ExploreToolUnitMiseVersion;

/** Whether the unit's tool or app works on it now; `unknown` when the processes could not be read. */
export type UnitActivity = 'idle' | 'busy' | 'unknown';

export type ExploreFinding = {
  unit: ExploreToolUnit;
  title: string;
  explanation: string;
  regeneration: string;
  risk: Risk;
  evidenceLines: string[];
  displayPath: string;
  activity: UnitActivity;
};

export type ExploreToolFailureCommandFailed = {
  reason: 'commandFailed';
  failure: ToolCommandFailure;
};

export type ExploreToolFailureOutputUnreadable = { reason: 'outputUnreadable'; detail: string };

export type ExploreToolFailure =
  | ExploreToolFailureCommandFailed
  | ExploreToolFailureOutputUnreadable;

/** The paths the unit's command removes, measured before and after its run; disjoint from catalog items. */
export function listUnitPaths(unit: ExploreToolUnit): AbsolutePath[] {
  switch (unit.kind) {
    case 'simulatorDevice':
      return [unit.dataPath];
    case 'dartPubCache':
      return unit.gcPaths;
    case 'miseVersion':
      return [unit.installPath];
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
      return ['uninstall', `${unit.toolName}@${unit.version}`];
  }
}

/** The whole argument list the unit's run executes, the tool's leading arguments first. */
export function buildUnitRunArguments(unit: ExploreToolUnit): string[] {
  return buildToolArguments({ name: unit.tool.name, args: buildUnitCommand(unit) });
}
