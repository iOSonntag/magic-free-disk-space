import { describe, expect, test } from 'bun:test';
import {
  loadProcessCommands,
  parseProcessCommandLines,
} from '../../src/scan/loadProcessCommands.js';

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

describe('loadProcessCommands', () => {
  test('lists the running processes, one of them bun', async () => {
    const result = await loadProcessCommands({ commandTimeoutMs: 5_000 });

    if (result.kind === 'failed') {
      throw new Error(`ps failed: ${result.failure.reason}`);
    }

    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value.some((commandLine) => commandLine.includes('bun'))).toBe(true);
  });
});
