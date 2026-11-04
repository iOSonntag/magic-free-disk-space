import { expect, test } from 'bun:test';
import { loadProcessCommands } from '../../../src/platform/darwin/loadProcessCommands.js';
import { describeOnPosix } from '../../support/posixOnly.js';

describeOnPosix('loadProcessCommands', () => {
  test('lists the running processes, one of them bun', async () => {
    const result = await loadProcessCommands({ commandTimeoutMs: 5_000 });

    if (result.kind === 'failed') {
      throw new Error(`ps failed: ${result.failure.reason}`);
    }

    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value.some((commandLine) => commandLine.includes('bun'))).toBe(true);
  });
});
