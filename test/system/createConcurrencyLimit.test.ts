import { describe, expect, test } from 'bun:test';
import { createConcurrencyLimit } from '../../src/system/createConcurrencyLimit.js';

function waitTicks(count: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, count);
  });
}

describe('createConcurrencyLimit', () => {
  test('never runs more tasks at once than allowed, and runs them all', async () => {
    const runLimited = createConcurrencyLimit({ maxConcurrent: 3 });
    let runningCount = 0;
    let maxRunningCount = 0;

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        runLimited(async () => {
          runningCount += 1;
          maxRunningCount = Math.max(maxRunningCount, runningCount);
          await waitTicks(1);
          runningCount -= 1;

          return index;
        }),
      ),
    );

    expect(maxRunningCount).toBe(3);
    expect(results).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });

  test('frees the slot of a failed task', async () => {
    const runLimited = createConcurrencyLimit({ maxConcurrent: 1 });

    await expect(runLimited(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await runLimited(async () => 'next')).toBe('next');
  });

  test('a task that waits on other limited tasks does not deadlock', async () => {
    const runLimited = createConcurrencyLimit({ maxConcurrent: 1 });
    const outer = await runLimited(async () => 'outer');
    const inner = await Promise.all([runLimited(async () => 'a'), runLimited(async () => 'b')]);

    expect([outer, ...inner]).toEqual(['outer', 'a', 'b']);
  });

  test('handles a long queue', async () => {
    const runLimited = createConcurrencyLimit({ maxConcurrent: 2 });
    const results = await Promise.all(
      Array.from({ length: 5000 }, (_, index) => runLimited(async () => index)),
    );

    expect(results).toHaveLength(5000);
    expect(results[4999]).toBe(4999);
  });
});
