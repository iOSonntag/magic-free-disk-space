import { describe, expect, test } from 'bun:test';
import { parseProcessCommandLines } from '../../src/system/parseProcessCommandLines.js';

describe('parseProcessCommandLines', () => {
  test('trims each line and drops the empty ones', () => {
    const commandLines = parseProcessCommandLines({
      stdoutText: '  launchd\n\n  bun test  \n\n',
    });

    expect(commandLines).toEqual(['launchd', 'bun test']);
  });

  test('returns no line for empty output', () => {
    const commandLines = parseProcessCommandLines({ stdoutText: '' });

    expect(commandLines).toEqual([]);
  });
});
