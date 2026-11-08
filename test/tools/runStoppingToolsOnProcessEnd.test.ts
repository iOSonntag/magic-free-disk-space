import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getErrorCode } from '../../src/system/getErrorCode.js';
import type { ProcessEndSignal } from '../../src/tools/toolsPlatform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { describeOnPosix } from '../support/posixOnly.js';
import {
  FIXTURE_SIGNAL_EXIT_CODES,
  waitUntilPresent,
} from './runStoppingToolsOnProcessEndFixture.js';
import { RUN_REJECTION_MESSAGE } from './runStoppingToolsOnProcessEndRejectionFixture.js';

const FIXTURE_SCRIPT_PATH = join(import.meta.dir, 'runStoppingToolsOnProcessEndFixture.ts');

const REJECTION_FIXTURE_SCRIPT_PATH = join(
  import.meta.dir,
  'runStoppingToolsOnProcessEndRejectionFixture.ts',
);

let fixtureRoot: FixtureRoot;
let survivingPids: number[];

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  survivingPids = [];
});

afterEach(async () => {
  for (const pid of survivingPids) {
    killIfAlive(pid);
  }

  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    if (getErrorCode(error) === 'ESRCH') {
      return false;
    }

    throw error;
  }
}

function killIfAlive(pid: number): void {
  if (isProcessAlive(pid)) {
    process.kill(pid, 'SIGKILL');
  }
}

/** A killed process is gone once it is reaped, which takes a moment after the kill. */
async function waitUntilProcessGone(pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!isProcessAlive(pid)) {
      return true;
    }

    await Bun.sleep(20);
  }

  return false;
}

const signals: ProcessEndSignal[] = ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM'];

describe('runStoppingToolsOnProcessEnd', () => {
  test('stops the running tool when the run rejects', async () => {
    const toolPidFile = join(fixtureRoot.tempDir, 'tool.pid');
    const script = Bun.spawn(
      [
        process.execPath,
        REJECTION_FIXTURE_SCRIPT_PATH,
        fixtureRoot.rootDir,
        fixtureRoot.homeDir,
        fixtureRoot.tempDir,
        toolPidFile,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    survivingPids.push(script.pid);

    await waitUntilPresent(toolPidFile);

    const toolPid = Number.parseInt(await readFile(toolPidFile, 'utf8'), 10);

    survivingPids.push(toolPid);

    expect(await script.exited).not.toBe(0);
    expect(await new Response(script.stderr).text()).toContain(RUN_REJECTION_MESSAGE);
    expect(await waitUntilProcessGone(toolPid)).toBe(true);
  });
});

describeOnPosix('runStoppingToolsOnProcessEnd on a signal', () => {
  test.each(signals)('on %s stops the running tool and exits with its code', async (signal) => {
    const toolPidFile = join(fixtureRoot.tempDir, 'tool.pid');
    const script = Bun.spawn(
      [
        process.execPath,
        FIXTURE_SCRIPT_PATH,
        fixtureRoot.rootDir,
        fixtureRoot.homeDir,
        fixtureRoot.tempDir,
        toolPidFile,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );

    survivingPids.push(script.pid);

    await waitUntilPresent(toolPidFile);

    const toolPid = Number.parseInt(await readFile(toolPidFile, 'utf8'), 10);

    survivingPids.push(toolPid);
    script.kill(signal);

    expect(await script.exited).toBe(FIXTURE_SIGNAL_EXIT_CODES[signal]);
    expect(await waitUntilProcessGone(toolPid)).toBe(true);
  });
});
