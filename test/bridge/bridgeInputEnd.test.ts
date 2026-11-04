import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { INPUT_ENDED_LINE } from './bridgeInputEndFixture.js';

const FIXTURE_PATH = join(import.meta.dir, 'bridgeInputEndFixture.ts');

/** Long enough for Bun to start the fixture on a slow runner, short of the test's own limit. */
const EXIT_TIMEOUT_MS = 20_000;

describe('the bridge once its input closes', () => {
  test(
    'reads every request, then ends on its own with its listeners released',
    async () => {
      const fixture = Bun.spawn([process.execPath, FIXTURE_PATH], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'ignore',
      });
      fixture.stdin.write('{"kind":"first"}\n\n{"kind":"second"}\n');
      await fixture.stdin.end();

      const stdout = new Response(fixture.stdout).text();
      const outcome = await Promise.race([
        fixture.exited.then(() => 'exited' as const),
        Bun.sleep(EXIT_TIMEOUT_MS).then(() => 'timedOut' as const),
      ]);

      if (outcome === 'timedOut') {
        fixture.kill();
      }

      await fixture.exited;

      expect({ outcome: outcome, exitCode: fixture.exitCode, stdout: await stdout }).toEqual({
        outcome: 'exited',
        exitCode: 0,
        stdout: `${INPUT_ENDED_LINE} after 2 requests\n`,
      });
    },
    EXIT_TIMEOUT_MS * 2,
  );
});
