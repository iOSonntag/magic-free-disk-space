import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import { isAnyBundleRunning } from '../system/isAnyBundleRunning.js';
import type { RunningProcesses } from '../system/systemPlatform.js';
import type { UnitActivity } from './exploreUnit.js';

/** What a probe saw of a simulator device; `state` as `simctl` reports it, such as `Shutdown`. */
export type UnitActivityFactsSimulatorDevice = { kind: 'simulatorDevice'; state: string };

export type UnitActivityFactsDartPubCache = { kind: 'dartPubCache' };

export type UnitActivityFactsMiseVersion = { kind: 'miseVersion' };

export type UnitActivityFactsSimulatorRuntime = { kind: 'simulatorRuntime' };

/** Every Android unit: an AVD, a system image, the emulator package, and a platform. */
export type UnitActivityFactsAndroid = { kind: 'android' };

/** Both Homebrew units: the old versions of a formula, and the orphans. */
export type UnitActivityFactsHomebrew = { kind: 'homebrew' };

export type UnitActivityFactsVscodeExtension = { kind: 'vscodeExtension' };

/** The install folder of one version, an asdf version's or an nvm version's. */
export type UnitActivityFactsVersionFolder = { kind: 'versionFolder'; folderPath: AbsolutePath };

export type UnitActivityFactsPnpmStore = { kind: 'pnpmStore' };

export type UnitActivityFactsVagrant = { kind: 'vagrant' };

/**
 * A toolchain is in use while rustup, cargo, or rustc runs, or a program runs from its own folder,
 * such as the proc-macro server rust-analyzer starts from the toolchain's `libexec`.
 */
export type UnitActivityFactsRustup = { kind: 'rustup'; toolchainPath: AbsolutePath };

/** The package folders are in use while conda, mamba, or micromamba runs. */
export type UnitActivityFactsConda = { kind: 'conda' };

export type UnitActivityFactsOllama = { kind: 'ollama' };

/**
 * A unit of the Hugging Face hub cache, in use while its CLI runs. Any Python program may read the
 * cache too, which no command shows; the recheck's exact paths guard a download that changes it.
 */
export type UnitActivityFactsHuggingFace = { kind: 'huggingFace' };

/** A model of LM Studio, in use while the app, its `llmster` daemon, or its `lms` CLI runs. */
export type UnitActivityFactsLmStudio = { kind: 'lmStudio' };

/**
 * A Claude Code version's entry of the versions folder. A session runs through the launcher's
 * link, so its command names no version: every version counts in use while any `claude` runs.
 */
export type UnitActivityFactsClaudeCodeVersion = {
  kind: 'claudeCodeVersion';
  versionPath: AbsolutePath;
};

/**
 * The app bundles whose running process writes the unit's files, such as Mail for its downloads,
 * the browsers for a partial download, or an IDE for the folders of its old versions.
 */
export type UnitActivityFactsAppBundles = { kind: 'appBundles'; bundlePaths: string[] };

/**
 * Files the probe offers only once each is untouched past its cutoff, such as a stale installer or
 * a Claude transcript; their times are the rule, so no process is read.
 */
export type UnitActivityFactsUntouchedFiles = { kind: 'untouchedFiles' };

/** An engine object: the engine itself refuses to remove one in use, which the call reports. */
export type UnitActivityFactsEngine = { kind: 'engine' };

/** The facts of a probe that the busy rule of each unit kind reads. */
export type UnitActivityFacts =
  | UnitActivityFactsSimulatorDevice
  | UnitActivityFactsDartPubCache
  | UnitActivityFactsMiseVersion
  | UnitActivityFactsSimulatorRuntime
  | UnitActivityFactsAndroid
  | UnitActivityFactsHomebrew
  | UnitActivityFactsVscodeExtension
  | UnitActivityFactsVersionFolder
  | UnitActivityFactsPnpmStore
  | UnitActivityFactsVagrant
  | UnitActivityFactsRustup
  | UnitActivityFactsConda
  | UnitActivityFactsOllama
  | UnitActivityFactsHuggingFace
  | UnitActivityFactsLmStudio
  | UnitActivityFactsClaudeCodeVersion
  | UnitActivityFactsAppBundles
  | UnitActivityFactsUntouchedFiles
  | UnitActivityFactsEngine;

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

// pnpm or pnpx as the last segment of a path or the whole program, its launcher or its script.
const PNPM_PROGRAM_PATTERN = /(^|\/)pnp[mx](\.[cm]?js)?( |$)/;

// On Windows a process is the path of its image, or its file name alone: the emulator's launcher
// and the `qemu-system-<arch>` of each running AVD.
const ANDROID_EMULATOR_WINDOWS_IMAGE_PATTERN = /(^|\\)(emulator|qemu-system-[^\\]+)\.exe$/i;

// The app and each of its helpers run as its one image on Windows.
const VSCODE_WINDOWS_IMAGE_PATTERN = /(^|\\)code\.exe$/i;

// pnpm's own build, or Node, which may run pnpm's script: Windows lists no arguments to tell.
const PNPM_WINDOWS_IMAGE_PATTERN = /(^|\\)(pnpm|pnpx|node)\.exe$/i;

// Each program as the last segment of a path or the whole executable.
const VAGRANT_PROGRAM_PATTERN = /(^|\/)vagrant( |$)/;

const RUSTUP_PROGRAM_PATTERN = /(^|\/)(rustup|cargo|rustc)( |$)/;

// mamba and micromamba download into, and link from, the same package folders as conda.
const CONDA_PROGRAM_PATTERN = /(^|\/)(conda|mamba|micromamba)( |$)/;

// conda run as a Python module, `python -m conda`.
const CONDA_MODULE_PATTERN = /(^| )-m conda( |$)/;

const OLLAMA_PROGRAM_PATTERN = /(^|\/)ollama( |$)/;

const HUGGING_FACE_PROGRAM_PATTERN = /(^|\/)(hf|huggingface-cli)( |$)/;

// The app and its helpers run from inside its bundle; its daemon and CLI by their names, or from
// LM Studio's home folder, where its docs place `bin/lms`.
const LM_STUDIO_BUNDLE_PATH_PART = '/LM Studio.app/Contents/';

const LM_STUDIO_HOME_PATH_PART = '/.lmstudio/';

const LM_STUDIO_PROGRAM_PATTERN = /(^|\/)(llmster|lms)( |$)/;

const CLAUDE_PROGRAM_PATTERN = /(^|\/)claude( |$)/;

/**
 * The one busy rule of the explore units, at the scan and right before a run. `unknown` for a unit
 * whose rule reads the processes while they are `null`, and for a unit no probe of the platform
 * whose processes these are reaches. Each rule knows the form of each platform that explores it.
 */
export function decideUnitActivity(params: {
  facts: UnitActivityFacts;
  runningProcesses: RunningProcesses | null;
}): UnitActivity {
  switch (params.facts.kind) {
    case 'simulatorDevice':
      return decideSimulatorDeviceActivity({
        state: params.facts.state,
        runningProcesses: params.runningProcesses,
      });
    case 'dartPubCache':
    case 'miseVersion':
      return 'idle';
    case 'simulatorRuntime':
      return decideSimulatorAppActivity({ runningProcesses: params.runningProcesses });
    case 'android':
      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) =>
          commandLine.includes(ANDROID_EMULATOR_QEMU_PATH_PART) ||
          ANDROID_EMULATOR_LAUNCHER_PATTERN.test(commandLine),
        isOwnerImagePath: (imagePath) => ANDROID_EMULATOR_WINDOWS_IMAGE_PATTERN.test(imagePath),
      });
    case 'homebrew':
      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) => commandLine.includes(HOMEBREW_RUBY_ENTRY_PATH_PART),
        // Windows explores no Homebrew.
        isOwnerImagePath: null,
      });
    case 'vscodeExtension':
      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) => commandLine.includes(VSCODE_BUNDLE_PATH_PART),
        isOwnerImagePath: (imagePath) => VSCODE_WINDOWS_IMAGE_PATTERN.test(imagePath),
      });
    case 'versionFolder': {
      const folderPathPrefix = `${params.facts.folderPath}/`;

      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) => commandLine.includes(folderPathPrefix),
        // Windows explores no version folders.
        isOwnerImagePath: null,
      });
    }
    case 'pnpmStore':
      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) => PNPM_PROGRAM_PATTERN.test(commandLine),
        isOwnerImagePath: (imagePath) => PNPM_WINDOWS_IMAGE_PATTERN.test(imagePath),
      });
    case 'vagrant':
      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) => VAGRANT_PROGRAM_PATTERN.test(commandLine),
        // Windows explores no Vagrant boxes.
        isOwnerImagePath: null,
      });
    case 'rustup': {
      const toolchainPath = params.facts.toolchainPath;

      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) =>
          RUSTUP_PROGRAM_PATTERN.test(commandLine) ||
          isPathInCommandLine({ path: toolchainPath, commandLine: commandLine }),
        // Windows explores no rustup toolchains.
        isOwnerImagePath: null,
      });
    }
    case 'conda':
      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) =>
          CONDA_PROGRAM_PATTERN.test(commandLine) || CONDA_MODULE_PATTERN.test(commandLine),
        // Windows explores no conda packages.
        isOwnerImagePath: null,
      });
    case 'ollama':
      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) => OLLAMA_PROGRAM_PATTERN.test(commandLine),
        // Windows explores no Ollama models.
        isOwnerImagePath: null,
      });
    case 'huggingFace':
      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) => HUGGING_FACE_PROGRAM_PATTERN.test(commandLine),
        // Windows explores no Hugging Face cache.
        isOwnerImagePath: null,
      });
    case 'lmStudio':
      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) =>
          commandLine.includes(LM_STUDIO_BUNDLE_PATH_PART) ||
          commandLine.includes(LM_STUDIO_HOME_PATH_PART) ||
          LM_STUDIO_PROGRAM_PATTERN.test(commandLine),
        // Windows explores no LM Studio models.
        isOwnerImagePath: null,
      });
    case 'claudeCodeVersion': {
      const versionPath = params.facts.versionPath;

      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) =>
          CLAUDE_PROGRAM_PATTERN.test(commandLine) ||
          isPathInCommandLine({ path: versionPath, commandLine: commandLine }),
        // Windows explores no Claude Code versions.
        isOwnerImagePath: null,
      });
    }
    case 'appBundles': {
      const bundlePaths = params.facts.bundlePaths;

      return decideProcessActivity({
        runningProcesses: params.runningProcesses,
        isOwnerCommandLine: (commandLine) =>
          isAnyBundleRunning({ bundlePaths: bundlePaths, commandLines: [commandLine] }),
        // Only macOS names app bundles, for Mail, the browsers, and the IDEs.
        isOwnerImagePath: null,
      });
    }
    case 'untouchedFiles':
    case 'engine':
      return 'idle';
  }
}

/** A device that is not shut down is in use; so is every device while Simulator.app runs. */
function decideSimulatorDeviceActivity(params: {
  state: string;
  runningProcesses: RunningProcesses | null;
}): UnitActivity {
  if (params.state !== SIMULATOR_DEVICE_IDLE_STATE) {
    return 'busy';
  }

  return decideSimulatorAppActivity({ runningProcesses: params.runningProcesses });
}

/** Busy while Simulator.app runs; `unknown` when the processes were not read. */
function decideSimulatorAppActivity(params: {
  runningProcesses: RunningProcesses | null;
}): UnitActivity {
  return decideProcessActivity({
    runningProcesses: params.runningProcesses,
    isOwnerCommandLine: (commandLine) => commandLine.includes(SIMULATOR_APP_EXECUTABLE_PATH_PART),
    // Windows explores no simulators.
    isOwnerImagePath: null,
  });
}

/**
 * Whether the command line names the path whole, followed by its end, a space, or a separator, so
 * the path of version `2.1.3` never matches the one of `2.1.30`.
 */
function isPathInCommandLine(params: { path: string; commandLine: string }): boolean {
  let index = params.commandLine.indexOf(params.path);

  while (index !== -1) {
    const next = params.commandLine.charAt(index + params.path.length);

    if (next === '' || next === ' ' || next === '/') {
      return true;
    }

    index = params.commandLine.indexOf(params.path, index + 1);
  }

  return false;
}

/**
 * Busy while a process of the unit's owner runs, told by the form the processes come in;
 * `unknown` when the processes were not read, and for image paths when `isOwnerImagePath` is
 * `null`, since no probe of Windows reaches the unit.
 */
function decideProcessActivity(params: {
  runningProcesses: RunningProcesses | null;
  isOwnerCommandLine: (commandLine: string) => boolean;
  isOwnerImagePath: ((imagePath: string) => boolean) | null;
}): UnitActivity {
  if (params.runningProcesses === null) {
    return 'unknown';
  }

  switch (params.runningProcesses.kind) {
    case 'commandLines':
      return params.runningProcesses.commandLines.some(params.isOwnerCommandLine) ? 'busy' : 'idle';
    case 'imagePaths':
      if (params.isOwnerImagePath === null) {
        return 'unknown';
      }

      return params.runningProcesses.imagePaths.some(params.isOwnerImagePath) ? 'busy' : 'idle';
  }
}
