import { describe, expect, test } from 'bun:test';
import type { UnitActivityFacts } from '../../src/explore/decideUnitActivity.js';
import { decideUnitActivity } from '../../src/explore/decideUnitActivity.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import {
  buildRunningCommandLines,
  buildRunningImagePaths,
} from '../support/runningProcessesFixtures.js';

const SIMULATOR_APP_COMMAND =
  '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator';

const UNRELATED_COMMAND = '/usr/bin/some-daemon';

const UNRELATED_IMAGE_PATH = 'C:\\Windows\\System32\\svchost.exe';

/** Each unit kind whose busy rule only reads the processes, with a command line of its owner. */
const PROCESS_RULES: { facts: UnitActivityFacts; ownerCommands: string[] }[] = [
  { facts: { kind: 'simulatorRuntime' }, ownerCommands: [SIMULATOR_APP_COMMAND] },
  {
    facts: { kind: 'android' },
    ownerCommands: [
      '/Users/example/Library/Android/sdk/emulator/qemu/darwin-aarch64/qemu-system-aarch64 -avd Pixel',
      '/Users/example/Library/Android/sdk/emulator/emulator -avd Pixel',
      'emulator',
    ],
  },
  {
    facts: { kind: 'homebrew' },
    ownerCommands: [
      '/opt/homebrew/Library/Homebrew/vendor/portable-ruby/current/bin/ruby /opt/homebrew/Library/Homebrew/brew.rb upgrade',
    ],
  },
  {
    facts: { kind: 'vscodeExtension' },
    ownerCommands: [
      '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
      '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper.app/Contents/MacOS/Code Helper',
    ],
  },
  {
    facts: { kind: 'pnpmStore' },
    ownerCommands: [
      'node /Users/example/Library/pnpm/.tools/pnpm/10.22.0/bin/pnpm install',
      'node /Users/example/.cache/node/corepack/v1/pnpm/12.15.0/bin/pnpm.cjs add zod',
      '/opt/homebrew/bin/pnpm store prune',
      'pnpx create-vite',
      'pnpm',
    ],
  },
];

/**
 * Each unit kind Windows explores whose busy rule only reads the processes, with an image of its
 * owner as Windows lists it: its path, or its file name alone, in any case.
 */
const windowsProcessRules: { facts: UnitActivityFacts; ownerImagePaths: string[] }[] = [
  {
    facts: { kind: 'android' },
    ownerImagePaths: [
      'C:\\Users\\example\\AppData\\Local\\Android\\Sdk\\emulator\\emulator.exe',
      'C:\\Users\\example\\AppData\\Local\\Android\\Sdk\\emulator\\qemu\\windows-x86_64\\qemu-system-x86_64.exe',
      'qemu-system-x86_64.exe',
      'EMULATOR.EXE',
      '\\\\server\\share\\emulator.exe',
    ],
  },
  {
    facts: { kind: 'vscodeExtension' },
    ownerImagePaths: [
      'C:\\Users\\example\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      'CODE.EXE',
    ],
  },
  {
    facts: { kind: 'pnpmStore' },
    ownerImagePaths: [
      'C:\\Users\\example\\AppData\\Local\\pnpm\\pnpm.exe',
      'Pnpm.EXE',
      'C:\\Program Files\\nodejs\\node.exe',
    ],
  },
];

const NVM_VERSION_FOLDER_PATH = buildTestAbsolutePath({
  text: '/Users/example/.nvm/versions/node/v20.11.1',
});

/**
 * Each local model unit, with the commands of its tool and commands that only look alike, which
 * leave it idle.
 */
const MODEL_PROCESS_RULES: {
  facts: UnitActivityFacts;
  ownerCommands: string[];
  otherCommands: string[];
}[] = [
  {
    facts: { kind: 'ollama' },
    ownerCommands: [
      '/Applications/Ollama.app/Contents/Resources/ollama serve',
      'ollama run llama3',
    ],
    otherCommands: ['/usr/local/bin/ollama-proxy'],
  },
  {
    facts: { kind: 'huggingFace' },
    ownerCommands: ['/opt/homebrew/bin/hf download org/name', 'huggingface-cli scan-cache'],
    otherCommands: ['/usr/local/bin/hfs mount', '/opt/example/hf-tools/run'],
  },
  {
    facts: { kind: 'lmStudio' },
    ownerCommands: [
      '/Applications/LM Studio.app/Contents/MacOS/LM Studio',
      '/Users/example/.lmstudio/bin/lms server start',
      'llmster',
    ],
    otherCommands: ['/usr/local/bin/lmserve'],
  },
];

const CLAUDE_CODE_VERSION_PATH = buildTestAbsolutePath({
  text: '/Users/example/.local/share/claude/versions/2.1.3',
});

const RUSTUP_TOOLCHAINS_PATH = '/Users/example/.rustup/toolchains';

const RUSTUP_TOOLCHAIN_PATH = buildTestAbsolutePath({
  text: `${RUSTUP_TOOLCHAINS_PATH}/nightly-aarch64-apple-darwin`,
});

/**
 * Each unit kind whose busy rule reads the processes by their command lines alone, with no rule
 * for an image path.
 */
const factsWithoutImagePathRule: UnitActivityFacts[] = [
  { kind: 'simulatorDevice', state: 'Shutdown' },
  { kind: 'simulatorRuntime' },
  { kind: 'homebrew' },
  { kind: 'versionFolder', folderPath: NVM_VERSION_FOLDER_PATH },
  { kind: 'vagrant' },
  { kind: 'rustup', toolchainPath: RUSTUP_TOOLCHAIN_PATH },
  { kind: 'conda' },
  { kind: 'ollama' },
  { kind: 'huggingFace' },
  { kind: 'lmStudio' },
  { kind: 'claudeCodeVersion', versionPath: CLAUDE_CODE_VERSION_PATH },
  { kind: 'appBundles', bundlePaths: ['/System/Applications/Mail.app'] },
];

describe('decideUnitActivity', () => {
  test('a shut-down device is idle while Simulator.app does not run', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'simulatorDevice', state: 'Shutdown' },
        runningProcesses: buildRunningCommandLines(['/usr/bin/some-daemon']),
      }),
    ).toBe('idle');
  });

  test('every device is busy while Simulator.app runs', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'simulatorDevice', state: 'Shutdown' },
        runningProcesses: buildRunningCommandLines([SIMULATOR_APP_COMMAND]),
      }),
    ).toBe('busy');
  });

  test('a booted device is busy, even with unknown processes', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'simulatorDevice', state: 'Booted' },
        runningProcesses: null,
      }),
    ).toBe('busy');
  });

  test('a shut-down device is unknown when the processes could not be read', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'simulatorDevice', state: 'Shutdown' },
        runningProcesses: null,
      }),
    ).toBe('unknown');
  });

  test('a Dart or mise unit is idle whatever the processes', () => {
    for (const runningProcesses of [
      null,
      buildRunningCommandLines([SIMULATOR_APP_COMMAND]),
      buildRunningImagePaths([UNRELATED_IMAGE_PATH]),
    ]) {
      expect(
        decideUnitActivity({
          facts: { kind: 'dartPubCache' },
          runningProcesses: runningProcesses,
        }),
      ).toBe('idle');
      expect(
        decideUnitActivity({
          facts: { kind: 'miseVersion' },
          runningProcesses: runningProcesses,
        }),
      ).toBe('idle');
    }
  });

  test('a runtime, Android, Homebrew, VS Code, or pnpm store unit is busy while each command of its owner runs', () => {
    for (const rule of PROCESS_RULES) {
      for (const ownerCommand of rule.ownerCommands) {
        expect(
          decideUnitActivity({
            facts: rule.facts,
            runningProcesses: buildRunningCommandLines([UNRELATED_COMMAND, ownerCommand]),
          }),
        ).toBe('busy');
      }
    }
  });

  test('a runtime, Android, Homebrew, VS Code, or pnpm store unit is idle while no owner runs, and unknown without processes', () => {
    for (const rule of PROCESS_RULES) {
      expect(
        decideUnitActivity({
          facts: rule.facts,
          runningProcesses: buildRunningCommandLines([UNRELATED_COMMAND]),
        }),
      ).toBe('idle');
      expect(decideUnitActivity({ facts: rule.facts, runningProcesses: null })).toBe('unknown');
    }
  });

  test('an Android, VS Code, or pnpm store unit is busy while each image of its owner runs on Windows', () => {
    for (const rule of windowsProcessRules) {
      for (const ownerImagePath of rule.ownerImagePaths) {
        expect(
          decideUnitActivity({
            facts: rule.facts,
            runningProcesses: buildRunningImagePaths([UNRELATED_IMAGE_PATH, ownerImagePath]),
          }),
        ).toBe('busy');
      }
    }
  });

  test('an Android, VS Code, or pnpm store unit is idle while no image of its owner runs on Windows', () => {
    for (const rule of windowsProcessRules) {
      expect(
        decideUnitActivity({
          facts: rule.facts,
          runningProcesses: buildRunningImagePaths([UNRELATED_IMAGE_PATH]),
        }),
      ).toBe('idle');
    }
  });

  test('a unit without a rule for an image path is unknown beside the images Windows lists', () => {
    for (const facts of factsWithoutImagePathRule) {
      expect(
        decideUnitActivity({
          facts: facts,
          runningProcesses: buildRunningImagePaths([UNRELATED_IMAGE_PATH]),
        }),
      ).toBe('unknown');
    }
  });

  test('an Android unit stays idle beside a command or an image that only holds the word emulator', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'android' },
        runningProcesses: buildRunningCommandLines([
          '/usr/local/bin/emulator-check accel',
          '/opt/example/emulators/run',
        ]),
      }),
    ).toBe('idle');
    expect(
      decideUnitActivity({
        facts: { kind: 'android' },
        runningProcesses: buildRunningImagePaths([
          'C:\\tools\\myemulator.exe',
          'C:\\tools\\emulator.exe.bak',
        ]),
      }),
    ).toBe('idle');
  });

  test('a VS Code unit stays idle beside an image whose name only holds the word code', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'vscodeExtension' },
        runningProcesses: buildRunningImagePaths([
          'C:\\tools\\vscode-helper.exe',
          'C:\\tools\\mycode.exe',
        ]),
      }),
    ).toBe('idle');
  });

  test('a pnpm store unit stays idle beside a program whose name only starts with pnpm', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'pnpmStore' },
        runningProcesses: buildRunningCommandLines([
          '/usr/local/bin/pnpm-sync watch',
          '/opt/example/pnpmx/run',
        ]),
      }),
    ).toBe('idle');
    expect(
      decideUnitActivity({
        facts: { kind: 'pnpmStore' },
        runningProcesses: buildRunningImagePaths([
          'C:\\tools\\pnpm-sync.exe',
          'C:\\tools\\pnpx-tools.exe',
        ]),
      }),
    ).toBe('idle');
  });

  test('a version folder is busy while a process runs from inside it', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'versionFolder', folderPath: NVM_VERSION_FOLDER_PATH },
        runningProcesses: buildRunningCommandLines([
          UNRELATED_COMMAND,
          `${NVM_VERSION_FOLDER_PATH}/bin/node server.js`,
        ]),
      }),
    ).toBe('busy');
  });

  test('a version folder stays idle beside a folder whose name only starts with its own', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'versionFolder', folderPath: NVM_VERSION_FOLDER_PATH },
        runningProcesses: buildRunningCommandLines([
          `${NVM_VERSION_FOLDER_PATH}0/bin/node server.js`,
        ]),
      }),
    ).toBe('idle');
  });

  test('a version folder is unknown when the processes could not be read', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'versionFolder', folderPath: NVM_VERSION_FOLDER_PATH },
        runningProcesses: null,
      }),
    ).toBe('unknown');
  });

  test('a local model unit is busy while its tool runs, idle without it, and unknown without processes', () => {
    for (const rule of MODEL_PROCESS_RULES) {
      for (const ownerCommand of rule.ownerCommands) {
        expect(
          decideUnitActivity({
            facts: rule.facts,
            runningProcesses: buildRunningCommandLines([UNRELATED_COMMAND, ownerCommand]),
          }),
        ).toBe('busy');
      }

      expect(
        decideUnitActivity({
          facts: rule.facts,
          runningProcesses: buildRunningCommandLines([UNRELATED_COMMAND, ...rule.otherCommands]),
        }),
      ).toBe('idle');
      expect(decideUnitActivity({ facts: rule.facts, runningProcesses: null })).toBe('unknown');
    }
  });

  test('every Claude Code version is busy while a claude session runs through the launcher', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'claudeCodeVersion', versionPath: CLAUDE_CODE_VERSION_PATH },
        runningProcesses: buildRunningCommandLines([UNRELATED_COMMAND, 'claude --resume']),
      }),
    ).toBe('busy');
    expect(
      decideUnitActivity({
        facts: { kind: 'claudeCodeVersion', versionPath: CLAUDE_CODE_VERSION_PATH },
        runningProcesses: buildRunningCommandLines([`${CLAUDE_CODE_VERSION_PATH} --print`]),
      }),
    ).toBe('busy');
  });

  test('a Claude Code version stays idle beside a version whose number only starts with its own', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'claudeCodeVersion', versionPath: CLAUDE_CODE_VERSION_PATH },
        runningProcesses: buildRunningCommandLines([
          `${CLAUDE_CODE_VERSION_PATH}0 --print`,
          '/usr/local/bin/claude-monitor',
        ]),
      }),
    ).toBe('idle');
    expect(
      decideUnitActivity({
        facts: { kind: 'claudeCodeVersion', versionPath: CLAUDE_CODE_VERSION_PATH },
        runningProcesses: null,
      }),
    ).toBe('unknown');
  });

  test('a Rust toolchain is busy while rustup, cargo, rustc, or a program of its own folder runs', () => {
    for (const ownerCommand of [
      '/Users/example/.cargo/bin/cargo build',
      'rustc --version',
      '/Users/example/.cargo/bin/rustup update',
      `${RUSTUP_TOOLCHAIN_PATH}/libexec/rust-analyzer-proc-macro-srv`,
    ]) {
      expect(
        decideUnitActivity({
          facts: { kind: 'rustup', toolchainPath: RUSTUP_TOOLCHAIN_PATH },
          runningProcesses: buildRunningCommandLines([UNRELATED_COMMAND, ownerCommand]),
        }),
      ).toBe('busy');
    }
  });

  test("a Rust toolchain stays idle beside another toolchain's program and a cargo plugin", () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'rustup', toolchainPath: RUSTUP_TOOLCHAIN_PATH },
        runningProcesses: buildRunningCommandLines([
          `${RUSTUP_TOOLCHAINS_PATH}/stable-aarch64-apple-darwin/libexec/rust-analyzer-proc-macro-srv`,
          '/Users/example/.cargo/bin/cargo-watch',
        ]),
      }),
    ).toBe('idle');
    expect(
      decideUnitActivity({
        facts: { kind: 'rustup', toolchainPath: RUSTUP_TOOLCHAIN_PATH },
        runningProcesses: null,
      }),
    ).toBe('unknown');
  });

  test('the conda packages are busy while conda, mamba, micromamba, or conda as a module runs', () => {
    for (const ownerCommand of [
      '/Users/example/miniconda3/bin/conda install numpy',
      '/Users/example/miniforge3/bin/mamba install numpy',
      'micromamba create -n tools',
      '/Users/example/miniconda3/bin/python -m conda update conda',
    ]) {
      expect(
        decideUnitActivity({
          facts: { kind: 'conda' },
          runningProcesses: buildRunningCommandLines([UNRELATED_COMMAND, ownerCommand]),
        }),
      ).toBe('busy');
    }
  });

  test('the conda packages stay idle beside a program whose name only starts with conda or mamba', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'conda' },
        runningProcesses: buildRunningCommandLines([
          '/usr/local/bin/condax run black',
          '/opt/example/mambaforge-tools/run',
          'python -m condastats',
        ]),
      }),
    ).toBe('idle');
    expect(
      decideUnitActivity({
        facts: { kind: 'conda' },
        runningProcesses: null,
      }),
    ).toBe('unknown');
  });
});
