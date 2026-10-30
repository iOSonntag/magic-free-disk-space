import { describe, expect, test } from 'bun:test';
import { decideComparisonActivity } from '../../src/explore/decideComparisonActivity.js';

describe('decideComparisonActivity', () => {
  test('an idle unit is unchanged', () => {
    const comparison = decideComparisonActivity({
      facts: { kind: 'simulatorDevice', state: 'Shutdown' },
      processCommands: [],
    });

    expect(comparison).toEqual({ kind: 'unchanged' });
  });

  test('a busy unit is busy', () => {
    const comparison = decideComparisonActivity({
      facts: { kind: 'simulatorDevice', state: 'Booted' },
      processCommands: [],
    });

    expect(comparison).toEqual({ kind: 'busy' });
  });

  test('a unit whose rule could not read the processes counts as busy', () => {
    const comparison = decideComparisonActivity({
      facts: { kind: 'simulatorDevice', state: 'Shutdown' },
      processCommands: null,
    });

    expect(comparison).toEqual({ kind: 'busy' });
  });
});
