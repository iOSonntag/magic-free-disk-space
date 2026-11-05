import { describe, expect, test } from 'bun:test';
import { decideComparisonActivity } from '../../src/explore/decideComparisonActivity.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';

describe('decideComparisonActivity', () => {
  test('an idle unit is unchanged', () => {
    const comparison = decideComparisonActivity({
      facts: { kind: 'simulatorDevice', state: 'Shutdown' },
      runningProcesses: buildRunningCommandLines([]),
    });

    expect(comparison).toEqual({ kind: 'unchanged' });
  });

  test('a busy unit is busy', () => {
    const comparison = decideComparisonActivity({
      facts: { kind: 'simulatorDevice', state: 'Booted' },
      runningProcesses: buildRunningCommandLines([]),
    });

    expect(comparison).toEqual({ kind: 'busy' });
  });

  test('a unit whose rule could not read the processes counts as busy', () => {
    const comparison = decideComparisonActivity({
      facts: { kind: 'simulatorDevice', state: 'Shutdown' },
      runningProcesses: null,
    });

    expect(comparison).toEqual({ kind: 'busy' });
  });
});
