import { describe, expect, test } from 'bun:test';
import type { UnitActivityFacts } from '../../src/explore/decideUnitActivity.js';
import { decideUnitActivity } from '../../src/explore/decideUnitActivity.js';

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
];

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

  test('a runtime, Android, Homebrew, or VS Code unit is busy while each command of its owner runs', () => {
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

  test('a runtime, Android, Homebrew, or VS Code unit is idle while no owner runs, and unknown without processes', () => {
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
});
