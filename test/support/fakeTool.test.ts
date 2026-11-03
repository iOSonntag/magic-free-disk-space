import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeTool } from './fakeTool.js';

/** The first fake of a Windows test process compiles its launcher, which takes seconds. */
const FAKE_TOOL_TEST_TIMEOUT_MS = 60_000;

type FakeToolRun = { stdoutText: string; exitCode: number | null };

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'magic-free-disk-space-fake-tool-test-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const runFakeToolProcess = (params: { path: string; args: string[] }): Promise<FakeToolRun> => {
  return new Promise((resolve, reject) => {
    const child = spawn(params.path, params.args, {
      cwd: folder,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MAGIC_FREE_DISK_SPACE_FAKE_TOOL_MARKER: 'passed' },
    });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ stdoutText: Buffer.concat(chunks).toString('utf8'), exitCode: exitCode });
    });
  });
};

describe('createFakeTool', () => {
  test(
    'creates a tool that runs its body with the arguments and the environment it is spawned with',
    async () => {
      const path = await createFakeTool({
        folder: join(folder, 'bin'),
        name: 'xcrun',
        body: `console.log(process.argv.slice(2).join(' '));
console.log(process.env.MAGIC_FREE_DISK_SPACE_FAKE_TOOL_MARKER);
process.exit(3);`,
      });

      const run = await runFakeToolProcess({ path: path, args: ['--find', 'clang'] });

      expect(run).toEqual({ stdoutText: '--find clang\npassed\n', exitCode: 3 });
    },
    FAKE_TOOL_TEST_TIMEOUT_MS,
  );
});
