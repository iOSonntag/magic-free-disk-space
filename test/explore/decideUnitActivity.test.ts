import { describe, expect, test } from 'bun:test';
import { decideUnitActivity } from '../../src/explore/decideUnitActivity.js';

const SIMULATOR_APP_COMMAND =
  '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator';

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
});
