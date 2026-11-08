import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { runChildProcess } from '../support/fixtureCommand.js';
import { INPUT_ENDED_LINE } from './bridgeInputEndFixture.js';

const fixturePath = join(import.meta.dir, 'bridgeInputEndFixture.ts');

/** Long enough for Bun to start the fixture on a slow runner, short of the test's own limit. */
const EXIT_TIMEOUT_MS = 20_000;

describe('the bridge once its input closes', () => {
  test(
    'reads every request, then ends on its own with its listeners released',
    async () => {
      const run = await runChildProcess({
        command: [process.execPath, fixturePath],
        stdin: new TextEncoder().encode('{"kind":"first"}\n\n{"kind":"second"}\n'),
        timeoutMs: EXIT_TIMEOUT_MS,
      });

      expect({
        timedOut: run.timedOut,
        exitCode: run.exitCode,
        stdout: new TextDecoder().decode(run.stdoutBytes),
      }).toEqual({
        timedOut: false,
        exitCode: 0,
        stdout: `${INPUT_ENDED_LINE} after 2 requests\n`,
      });
    },
    EXIT_TIMEOUT_MS * 2,
  );
});
