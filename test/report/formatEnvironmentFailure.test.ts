import { describe, expect, test } from 'bun:test';
import { formatEnvironmentFailure } from '../../src/report/formatEnvironmentFailure.js';

describe('formatEnvironmentFailure', () => {
  test('names each reason the tool refuses to start', () => {
    expect(
      formatEnvironmentFailure({ failure: { reason: 'unsupportedPlatform', platform: 'linux' } }),
    ).toBe('This tool runs on macOS only.');
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
  });
});
