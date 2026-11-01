import { describe, expect, test } from 'bun:test';
import type { UnitActivityFacts } from '../../src/explore/decideUnitActivity.js';
import { decideUnitActivity } from '../../src/explore/decideUnitActivity.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

const SIMULATOR_APP_COMMAND =
  '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator';

const UNRELATED_COMMAND = '/usr/bin/some-daemon';

/** Each unit kind whose busy rule only reads the processes, with a command of its owner. */
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

const NVM_VERSION_FOLDER_PATH = buildTestAbsolutePath({
  text: '/Users/example/.nvm/versions/node/v20.11.1',
});

describe('decideUnitActivity', () => {
  test('a shut-down device is idle while Simulator.app does not run', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'simulatorDevice', state: 'Shutdown' },
        processCommands: ['/usr/bin/some-daemon'],
      }),
    ).toBe('idle');
  });

  test('every device is busy while Simulator.app runs', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'simulatorDevice', state: 'Shutdown' },
        processCommands: [SIMULATOR_APP_COMMAND],
      }),
    ).toBe('busy');
  });

  test('a booted device is busy, even with unknown processes', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'simulatorDevice', state: 'Booted' },
        processCommands: null,
      }),
    ).toBe('busy');
  });

  test('a shut-down device is unknown when the processes could not be read', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'simulatorDevice', state: 'Shutdown' },
        processCommands: null,
      }),
    ).toBe('unknown');
  });

  test('a Dart or mise unit is idle whatever the processes', () => {
    for (const processCommands of [null, [SIMULATOR_APP_COMMAND]]) {
      expect(
        decideUnitActivity({ facts: { kind: 'dartPubCache' }, processCommands: processCommands }),
      ).toBe('idle');
      expect(
        decideUnitActivity({ facts: { kind: 'miseVersion' }, processCommands: processCommands }),
      ).toBe('idle');
    }
  });

  test('a runtime, Android, Homebrew, VS Code, or pnpm store unit is busy while each command of its owner runs', () => {
    for (const rule of PROCESS_RULES) {
      for (const ownerCommand of rule.ownerCommands) {
        expect(
          decideUnitActivity({
            facts: rule.facts,
            processCommands: [UNRELATED_COMMAND, ownerCommand],
          }),
        ).toBe('busy');
      }
    }
  });

  test('a runtime, Android, Homebrew, VS Code, or pnpm store unit is idle while no owner runs, and unknown without processes', () => {
    for (const rule of PROCESS_RULES) {
      expect(decideUnitActivity({ facts: rule.facts, processCommands: [UNRELATED_COMMAND] })).toBe(
        'idle',
      );
      expect(decideUnitActivity({ facts: rule.facts, processCommands: null })).toBe('unknown');
    }
  });

  test('an Android unit stays idle beside a command that only starts with the word emulator', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'android' },
        processCommands: ['/usr/local/bin/emulator-check accel', '/opt/example/emulators/run'],
      }),
    ).toBe('idle');
  });

  test('a pnpm store unit stays idle beside a program whose name only starts with pnpm', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'pnpmStore' },
        processCommands: ['/usr/local/bin/pnpm-sync watch', '/opt/example/pnpmx/run'],
      }),
    ).toBe('idle');
  });

  test('a version folder is busy while a process runs from inside it', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'versionFolder', folderPath: NVM_VERSION_FOLDER_PATH },
        processCommands: [UNRELATED_COMMAND, `${NVM_VERSION_FOLDER_PATH}/bin/node server.js`],
      }),
    ).toBe('busy');
  });

  test('a version folder stays idle beside a folder whose name only starts with its own', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'versionFolder', folderPath: NVM_VERSION_FOLDER_PATH },
        processCommands: [`${NVM_VERSION_FOLDER_PATH}0/bin/node server.js`],
      }),
    ).toBe('idle');
  });

  test('a version folder is unknown when the processes could not be read', () => {
    expect(
      decideUnitActivity({
        facts: { kind: 'versionFolder', folderPath: NVM_VERSION_FOLDER_PATH },
        processCommands: null,
      }),
    ).toBe('unknown');
  });
});
