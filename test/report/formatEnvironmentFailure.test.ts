import { describe, expect, test } from 'bun:test';
import {
  formatEnvironmentFailure,
  formatUnsupportedPlatform,
} from '../../src/report/formatEnvironmentFailure.js';

describe('formatUnsupportedPlatform', () => {
  test('names the operating systems the tool runs on', () => {
    expect(formatUnsupportedPlatform()).toBe('This tool runs on macOS and Windows only.');
  });
});

describe('formatEnvironmentFailure', () => {
  test('names each reason the tool refuses to start', () => {
    expect(formatEnvironmentFailure({ failure: { reason: 'runAsRoot' } })).toBe(
      'Run this tool as yourself, not as root or with sudo: it deletes in the home folder of the user who runs it.',
    );
    expect(
      formatEnvironmentFailure({
        failure: { reason: 'unresolvable', path: 'DARWIN_USER_TEMP_DIR', code: 'timedOut' },
      }),
    ).toBe('Cannot resolve DARWIN_USER_TEMP_DIR: timedOut');
    expect(formatEnvironmentFailure({ failure: { reason: 'homeNotOwned', path: '/' } })).toBe(
      'The home folder / does not belong to you. Check the HOME variable.',
    );
    expect(
      formatEnvironmentFailure({ failure: { reason: 'tempOverlapsHome', path: '/Users/tester' } }),
    ).toBe(
      'The temporary folder /Users/tester overlaps the home folder, so nothing in it can count as temporary.',
    );
    expect(
      formatEnvironmentFailure({ failure: { reason: 'tempHoldsProtectedFolder', path: 'D:\\' } }),
    ).toBe(
      'The temporary folder D:\\ is or holds a drive root or a folder this tool never deletes, so nothing in it can count as temporary.',
    );
    expect(formatEnvironmentFailure({ failure: { reason: 'runElevated' } })).toBe(
      'Start this tool without "Run as administrator": it deletes in the user folder of the account that runs it.',
    );
    expect(
      formatEnvironmentFailure({
        failure: { reason: 'profileNotOwned', path: 'C:\\Users\\tester' },
      }),
    ).toBe('The user folder C:\\Users\\tester does not belong to your Windows account.');
    expect(
      formatEnvironmentFailure({
        failure: {
          reason: 'variableElsewhere',
          variableName: 'TEMP',
          path: 'C:\\Users\\tester\\AppData\\Local\\Temp',
        },
      }),
    ).toBe(
      'The environment variable TEMP does not point to C:\\Users\\tester\\AppData\\Local\\Temp, the folder Windows keeps for your account. Start this tool from a normal session of your account.',
    );
  });

  test('names a failed call of the system by its name and its code in hex, never as a path', () => {
    expect(
      formatEnvironmentFailure({
        failure: { reason: 'callFailed', call: 'GetTokenInformation', code: 5 },
      }),
    ).toBe(
      'Cannot read your account and its folders from the system: GetTokenInformation failed with 0x00000005',
    );
    expect(
      formatEnvironmentFailure({
        failure: { reason: 'callFailed', call: 'SHGetKnownFolderPath', code: 0x8007_0002 },
      }),
    ).toBe(
      'Cannot read your account and its folders from the system: SHGetKnownFolderPath failed with 0x80070002',
    );
  });
});
