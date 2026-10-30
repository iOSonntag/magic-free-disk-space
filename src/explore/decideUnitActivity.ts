import type { UnitActivity } from './exploreUnit.js';

/** What a probe saw of a simulator device; `state` as `simctl` reports it, such as `Shutdown`. */
export type UnitActivityFactsSimulatorDevice = { kind: 'simulatorDevice'; state: string };

export type UnitActivityFactsDartPubCache = { kind: 'dartPubCache' };

export type UnitActivityFactsMiseVersion = { kind: 'miseVersion' };

export type UnitActivityFactsSimulatorRuntime = { kind: 'simulatorRuntime' };

/** Every Android unit: an AVD, a system image, and the emulator package. */
export type UnitActivityFactsAndroid = { kind: 'android' };

/** Both Homebrew units: the old versions of a formula, and the orphans. */
export type UnitActivityFactsHomebrew = { kind: 'homebrew' };

export type UnitActivityFactsVscodeExtension = { kind: 'vscodeExtension' };

/** The facts of a probe that the busy rule of each unit kind reads. */
export type UnitActivityFacts =
  | UnitActivityFactsSimulatorDevice
  | UnitActivityFactsDartPubCache
  | UnitActivityFactsMiseVersion
  | UnitActivityFactsSimulatorRuntime
  | UnitActivityFactsAndroid
  | UnitActivityFactsHomebrew
  | UnitActivityFactsVscodeExtension;

const SIMULATOR_APP_EXECUTABLE_PATH_PART = '/Simulator.app/Contents/MacOS/Simulator';

const SIMULATOR_DEVICE_IDLE_STATE = 'Shutdown';

// The emulator starts a `qemu-system-<arch>` process for each running AVD.
const ANDROID_EMULATOR_QEMU_PATH_PART = '/qemu-system-';

// The `emulator` launcher itself, as the last segment of a path or the whole executable.
const ANDROID_EMULATOR_LAUNCHER_PATTERN = /(^|\/)emulator( |$)/;

// Every `brew` command runs Homebrew's Ruby entry point.
const HOMEBREW_RUBY_ENTRY_PATH_PART = '/Library/Homebrew/brew.rb';

// The app and each of its helpers run from inside the bundle, wherever it is installed.
const VSCODE_BUNDLE_PATH_PART = '/Visual Studio Code.app/Contents/';

/**
 * The one busy rule of the explore units, at the scan and right before a run. `unknown` only for
 * a unit whose rule reads the processes while they are `null`.
 */
export function decideUnitActivity(params: {
  facts: UnitActivityFacts;
  processCommands: string[] | null;
}): UnitActivity {
  switch (params.facts.kind) {
    case 'simulatorDevice':
      return decideSimulatorDeviceActivity({
        state: params.facts.state,
        processCommands: params.processCommands,
      });
    case 'dartPubCache':
    case 'miseVersion':
      return 'idle';
    case 'simulatorRuntime':
      return decideSimulatorAppActivity({ processCommands: params.processCommands });
    case 'android':
      return decideProcessActivity({
        processCommands: params.processCommands,
        isOwnerProcess: (command) =>
          command.includes(ANDROID_EMULATOR_QEMU_PATH_PART) ||
          ANDROID_EMULATOR_LAUNCHER_PATTERN.test(command),
      });
    case 'homebrew':
      return decideProcessActivity({
        processCommands: params.processCommands,
        isOwnerProcess: (command) => command.includes(HOMEBREW_RUBY_ENTRY_PATH_PART),
      });
    case 'vscodeExtension':
      return decideProcessActivity({
        processCommands: params.processCommands,
        isOwnerProcess: (command) => command.includes(VSCODE_BUNDLE_PATH_PART),
      });
  }
}

/** A device that is not shut down is in use; so is every device while Simulator.app runs. */
function decideSimulatorDeviceActivity(params: {
  state: string;
  processCommands: string[] | null;
}): UnitActivity {
  if (params.state !== SIMULATOR_DEVICE_IDLE_STATE) {
    return 'busy';
  }

  return decideSimulatorAppActivity({ processCommands: params.processCommands });
}

/** Busy while Simulator.app runs; `unknown` when the processes were not read. */
function decideSimulatorAppActivity(params: { processCommands: string[] | null }): UnitActivity {
  return decideProcessActivity({
    processCommands: params.processCommands,
    isOwnerProcess: (command) => command.includes(SIMULATOR_APP_EXECUTABLE_PATH_PART),
  });
}

/** Busy while a process of the unit's owner runs; `unknown` when the processes were not read. */
function decideProcessActivity(params: {
  processCommands: string[] | null;
  isOwnerProcess: (command: string) => boolean;
}): UnitActivity {
  if (params.processCommands === null) {
    return 'unknown';
  }

  return params.processCommands.some(params.isOwnerProcess) ? 'busy' : 'idle';
}
