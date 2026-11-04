import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFixtureGitEnvironment, spawnFixtureCommand } from './fixtureCommand.js';

const fixtureEnvironment = { FIXTURE_COMMAND_MARKER: 'fixture-value' };
const ECHO_STDIN_SCRIPT = "process.stdout.write(require('node:fs').readFileSync(0, 'utf8'));";
const PRINT_MARKERS_SCRIPT = `const { readFileSync } = require('node:fs');
console.log(readFileSync('marker.txt', 'utf8'));
console.log(process.env.FIXTURE_COMMAND_MARKER);
console.log(process.env.MAGIC_FREE_DISK_SPACE_TEST_MARKER ?? 'absent');`;

describe('buildFixtureGitEnvironment', () => {
  test('keeps every key of the base environment', () => {
    const environment = buildFixtureGitEnvironment({
      baseEnvironment: { PATH: '/fixture/bin', HOME: '/fixture/home' },
      globalConfigPath: '/fixture/gitconfig',
    });

    expect(environment).toMatchObject({ PATH: '/fixture/bin', HOME: '/fixture/home' });
  });

  test('sets the git variables, with the global config at the given path', () => {
    const environment = buildFixtureGitEnvironment({
      baseEnvironment: {},
      globalConfigPath: '/fixture/gitconfig',
    });

    expect(environment).toEqual({
      GIT_CONFIG_GLOBAL: '/fixture/gitconfig',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'Fixture Test',
      GIT_AUTHOR_EMAIL: 'fixture-test@example.com',
      GIT_COMMITTER_NAME: 'Fixture Test',
      GIT_COMMITTER_EMAIL: 'fixture-test@example.com',
    });
  });

  test('overrides a git variable of the base environment', () => {
    const environment = buildFixtureGitEnvironment({
      baseEnvironment: { GIT_AUTHOR_NAME: 'Machine Author' },
      globalConfigPath: '/fixture/gitconfig',
    });

    expect(environment.GIT_AUTHOR_NAME).toBe('Fixture Test');
  });
});

describe('spawnFixtureCommand', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'magic-free-disk-space-fixture-command-test-'));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  test('returns the exit code, stdout and stderr of the command', async () => {
    const run = await spawnFixtureCommand({
      command: [
        process.execPath,
        '-e',
        "console.log('printed'); console.error('failed'); process.exitCode = 3;",
      ],
      workingDir: folder,
      environment: fixtureEnvironment,
      stdinText: null,
    });

    expect(run).toEqual({ exitCode: 3, stdoutText: 'printed\n', stderrText: 'failed\n' });
  });

  test('feeds stdinText to the command', async () => {
    const run = await spawnFixtureCommand({
      command: [process.execPath, '-e', ECHO_STDIN_SCRIPT],
      workingDir: folder,
      environment: fixtureEnvironment,
      stdinText: 'typed\n',
    });

    expect(run).toEqual({ exitCode: 0, stdoutText: 'typed\n', stderrText: '' });
  });

  test('gives the command no stdin for null', async () => {
    const run = await spawnFixtureCommand({
      command: [process.execPath, '-e', ECHO_STDIN_SCRIPT],
      workingDir: folder,
      environment: fixtureEnvironment,
      stdinText: null,
    });

    expect(run).toEqual({ exitCode: 0, stdoutText: '', stderrText: '' });
  });

  test('runs the command in workingDir with exactly the environment', async () => {
    await writeFile(join(folder, 'marker.txt'), 'in the working folder');
    process.env.MAGIC_FREE_DISK_SPACE_TEST_MARKER = 'inherited';

    try {
      const run = await spawnFixtureCommand({
        command: [process.execPath, '-e', PRINT_MARKERS_SCRIPT],
        workingDir: folder,
        environment: fixtureEnvironment,
        stdinText: null,
      });

      expect(run.stdoutText).toBe('in the working folder\nfixture-value\nabsent\n');
    } finally {
      delete process.env.MAGIC_FREE_DISK_SPACE_TEST_MARKER;
    }
  });
});
