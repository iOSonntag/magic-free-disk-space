import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildToolArguments,
  runToolCommand,
  stopRunningTools,
  TOOL_MAX_OUTPUT_BYTES,
} from '../../src/tools/runToolCommand.js';
import type { ToolName } from '../../src/tools/toolInstallLocations.js';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot, isPresent } from '../support/fixtureRoot.js';

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function runFakeTool(params: {
  name: ToolName;
  body: string;
  args?: string[];
  timeoutMs?: number;
}): ReturnType<typeof runToolCommand> {
  const path = await createFakeTool({
    folder: join(fixtureRoot.rootDir, 'bin'),
    name: params.name,
    body: params.body,
  });

  return runToolCommand({
    tool: { name: params.name, path: path },
    args: params.args ?? [],
    homeDir: fixtureRoot.homeDir,
    tempDir: fixtureRoot.tempDir,
    timeoutMs: params.timeoutMs ?? 10_000,
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return false;
    }

    throw error;
  }
}

/** A killed grandchild is gone once launchd reaps it, which takes a moment after the kill. */
async function waitUntilProcessGone(pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!isProcessAlive(pid)) {
      return true;
    }

    await Bun.sleep(20);
  }

  return false;
}

async function loadPid(path: string): Promise<number> {
  return Number.parseInt(await readFile(path, 'utf8'), 10);
}

async function waitUntilPresent(path: string): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    if (await isPresent(path)) {
      return;
    }

    await Bun.sleep(20);
  }

  throw new Error(`${path} did not appear.`);
}

describe('runToolCommand', () => {
  test('returns the output and the stderr tail of a run that exits with 0', async () => {
    const result = await runFakeTool({
      name: 'xcrun',
      body: `echo out
i=0
while [ $i -lt 2000 ]; do echo "line $i" >&2; i=$((i+1)); done`,
    });

    expect(result.kind).toBe('succeeded');

    if (result.kind !== 'succeeded') {
      return;
    }

    expect(result.value.stdoutText).toBe('out\n');
    expect(result.value.stderrTail.length).toBe(4096);
    expect(result.value.stderrTail.endsWith('line 1998\nline 1999\n')).toBe(true);
  });

  test('fails with the exit code and the stderr tail of a non-zero exit', async () => {
    const result = await runFakeTool({ name: 'xcrun', body: 'echo broken >&2\nexit 3' });

    expect(result).toEqual({
      kind: 'failed',
      failure: { reason: 'exitedWithError', exitCode: 3, stderrTail: 'broken\n' },
    });
  });

  test('fails with the signal that ended the tool', async () => {
    const result = await runFakeTool({ name: 'xcrun', body: 'echo ending >&2\nkill -TERM $$' });

    expect(result).toEqual({
      kind: 'failed',
      failure: { reason: 'endedBySignal', signal: 'SIGTERM', stderrTail: 'ending\n' },
    });
  });

  test('at the limit kills the tool and the processes it started', async () => {
    const pidFile = join(fixtureRoot.tempDir, 'grandchild.pid');
    const startedMs = Date.now();

    const result = await runFakeTool({
      name: 'xcrun',
      body: `/bin/sleep 60 &
echo $! > '${pidFile}'
echo waiting >&2
/bin/sleep 60`,
      timeoutMs: 500,
    });

    expect(result).toEqual({
      kind: 'failed',
      failure: { reason: 'timedOut', timeoutMs: 500, stderrTail: 'waiting\n' },
    });
    expect(Date.now() - startedMs).toBeLessThan(5_000);
    expect(await waitUntilProcessGone(await loadPid(pidFile))).toBe(true);
  });

  test('after the tool exits kills what it left running', async () => {
    const pidFile = join(fixtureRoot.tempDir, 'grandchild.pid');

    const result = await runFakeTool({
      name: 'xcrun',
      body: `/bin/sleep 60 &
echo $! > '${pidFile}'
echo done`,
      timeoutMs: 5_000,
    });

    expect(result).toEqual({ kind: 'succeeded', value: { stdoutText: 'done\n', stderrTail: '' } });
    expect(await waitUntilProcessGone(await loadPid(pidFile))).toBe(true);
  });

  test('kills the tool once its output passes the cap', async () => {
    const result = await runFakeTool({
      name: 'xcrun',
      body: 'echo flooding >&2\nexec /usr/bin/yes',
    });

    expect(result).toEqual({
      kind: 'failed',
      failure: {
        reason: 'outputTooLarge',
        maxOutputBytes: TOOL_MAX_OUTPUT_BYTES,
        stderrTail: 'flooding\n',
      },
    });
  });

  test('runs the tool with the fixed environment alone', async () => {
    process.env.MAGIC_FREE_DISK_SPACE_TEST_MARKER = 'inherited';

    try {
      const result = await runFakeTool({ name: 'mise', body: '/usr/bin/env' });

      expect(result.kind).toBe('succeeded');

      if (result.kind !== 'succeeded') {
        return;
      }

      const lines = result.value.stdoutText.split('\n');

      expect(lines).toContain(`HOME=${fixtureRoot.homeDir}`);
      expect(lines).toContain(`TMPDIR=${fixtureRoot.tempDir}`);
      expect(lines).toContain('LANG=en_US.UTF-8');
      expect(lines).toContain(
        `PATH=${join(fixtureRoot.rootDir, 'bin')}:/usr/bin:/bin:/usr/sbin:/sbin`,
      );
      expect(lines).toContain('MISE_OFFLINE=1');
      expect(result.value.stdoutText).not.toContain('MAGIC_FREE_DISK_SPACE_TEST_MARKER');
    } finally {
      delete process.env.MAGIC_FREE_DISK_SPACE_TEST_MARKER;
    }
  });

  test('runs the tool in the temporary folder', async () => {
    const result = await runFakeTool({ name: 'xcrun', body: '/bin/pwd -P' });

    expect(result).toEqual({
      kind: 'succeeded',
      value: { stdoutText: `${await realpath(fixtureRoot.tempDir)}\n`, stderrTail: '' },
    });
  });

  test('stopRunningTools kills a running tool and what it started, and the run settles', async () => {
    const toolPidFile = join(fixtureRoot.tempDir, 'tool.pid');
    const grandchildPidFile = join(fixtureRoot.tempDir, 'grandchild.pid');
    // The tool's pid file is written last and moved into place whole, so it marks both as ready.
    const run = runFakeTool({
      name: 'xcrun',
      body: `/bin/sleep 60 &
echo $! > '${grandchildPidFile}'
echo $$ > '${toolPidFile}.partial'
/bin/mv '${toolPidFile}.partial' '${toolPidFile}'
/bin/sleep 60`,
      timeoutMs: 60_000,
    });

    await waitUntilPresent(toolPidFile);
    stopRunningTools();

    const result = await run;

    expect(result).toMatchObject({
      kind: 'failed',
      failure: { reason: 'endedBySignal', signal: 'SIGKILL' },
    });
    expect(await waitUntilProcessGone(await loadPid(toolPidFile))).toBe(true);
    expect(await waitUntilProcessGone(await loadPid(grandchildPidFile))).toBe(true);
  });

  test('puts the leading argument of dart before the arguments', async () => {
    const result = await runFakeTool({
      name: 'dart',
      body: `printf '%s\\n' "$@"`,
      args: ['pub', 'cache', 'gc', '--dry-run'],
    });

    expect(result).toEqual({
      kind: 'succeeded',
      value: { stdoutText: '--suppress-analytics\npub\ncache\ngc\n--dry-run\n', stderrTail: '' },
    });
  });

  test('buildToolArguments puts the leading arguments of the tool first', () => {
    expect(buildToolArguments({ name: 'dart', args: ['pub', 'cache', 'gc', '--force'] })).toEqual([
      '--suppress-analytics',
      'pub',
      'cache',
      'gc',
      '--force',
    ]);
    expect(buildToolArguments({ name: 'mise', args: ['uninstall', 'node@20.1.0'] })).toEqual([
      'uninstall',
      'node@20.1.0',
    ]);
  });

  test('fails as spawn failed for a binary that is not there', async () => {
    const result = await runToolCommand({
      tool: { name: 'xcrun', path: join(fixtureRoot.rootDir, 'missing', 'xcrun') },
      args: [],
      homeDir: fixtureRoot.homeDir,
      tempDir: fixtureRoot.tempDir,
      timeoutMs: 5_000,
    });

    expect(result.kind).toBe('failed');

    if (result.kind !== 'failed') {
      return;
    }

    expect(result.failure.reason).toBe('spawnFailed');
  });
});
