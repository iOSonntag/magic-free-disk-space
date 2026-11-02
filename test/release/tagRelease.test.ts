import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import type { FixtureCommandRun } from './releaseScriptFixtures.js';
import { runFixtureCommand, runReleaseScript } from './releaseScriptFixtures.js';

// Each test runs a dozen git commands and a Bun process on its fixture.
setDefaultTimeout(30_000);

describe('tagRelease.sh', () => {
  let fixtureRoot: FixtureRoot;
  let originDir: string;
  let cloneDir: string;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    originDir = join(fixtureRoot.rootDir, 'origin.git');
    cloneDir = join(fixtureRoot.rootDir, 'clone');

    await runGit({
      workingDir: fixtureRoot.rootDir,
      args: ['init', '--bare', '--initial-branch=main', originDir],
    });
    await runGit({
      workingDir: fixtureRoot.rootDir,
      args: ['init', '--initial-branch=main', cloneDir],
    });
    await runGit({ workingDir: cloneDir, args: ['remote', 'add', 'origin', originDir] });
    await createCommit({ workingDir: cloneDir, fileName: 'README.md', message: 'First commit' });
    await runGit({
      workingDir: cloneDir,
      args: ['push', '--quiet', '--set-upstream', 'origin', 'main'],
    });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  async function runGit(params: { workingDir: string; args: string[] }): Promise<string> {
    const run = await runFixtureCommand({
      fixtureRoot: fixtureRoot,
      workingDir: params.workingDir,
      command: ['git', ...params.args],
      stdinText: null,
    });

    if (run.exitCode !== 0) {
      throw new Error(`git ${params.args.join(' ')} failed: ${run.stderrText}`);
    }

    return run.stdoutText.trim();
  }

  async function createCommit(params: {
    workingDir: string;
    fileName: string;
    message: string;
  }): Promise<void> {
    await writeFile(join(params.workingDir, params.fileName), `${params.message}\n`);
    await runGit({ workingDir: params.workingDir, args: ['add', params.fileName] });
    await runGit({
      workingDir: params.workingDir,
      args: ['commit', '--quiet', '--message', params.message],
    });
  }

  async function seedOriginTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      await runGit({ workingDir: cloneDir, args: ['tag', tag] });
      await runGit({
        workingDir: cloneDir,
        args: ['push', '--quiet', 'origin', `refs/tags/${tag}`],
      });
    }
  }

  async function loadTagNames(gitDir: string): Promise<string[]> {
    const tagText = await runGit({ workingDir: gitDir, args: ['tag', '--list'] });

    return tagText === '' ? [] : tagText.split('\n');
  }

  async function runTagRelease(params: {
    args: string[];
    stdinText: string | null;
  }): Promise<FixtureCommandRun> {
    return runReleaseScript({
      fixtureRoot: fixtureRoot,
      scriptName: 'tagRelease.sh',
      args: params.args,
      workingDir: cloneDir,
      stdinText: params.stdinText,
    });
  }

  async function expectRefusal(params: {
    args: string[];
    stdinText: string | null;
    errorText: string;
    tagNames: string[];
  }): Promise<void> {
    const run = await runTagRelease({ args: params.args, stdinText: params.stdinText });

    expect(run.exitCode).toBe(1);
    expect(run.stderrText).toContain(params.errorText);
    expect(await loadTagNames(cloneDir)).toEqual(params.tagNames);
    expect(await loadTagNames(originDir)).toEqual(params.tagNames);
  }

  test('pushes an annotated tag on HEAD after the confirmation', async () => {
    await seedOriginTags(['v1.0.0']);

    const run = await runTagRelease({ args: ['1.1.0'], stdinText: 'v1.1.0\n' });

    expect(run.exitCode).toBe(0);
    expect(run.stdoutText).toContain('Type v1.1.0 to push it and publish the release: ');
    expect(run.stdoutText).toContain('First commit');
    expect(run.stdoutText).toContain('Actions > Release');
    expect(await runGit({ workingDir: originDir, args: ['cat-file', '-t', 'v1.1.0'] })).toBe('tag');
    expect(await runGit({ workingDir: originDir, args: ['rev-parse', 'v1.1.0^{commit}'] })).toBe(
      await runGit({ workingDir: cloneDir, args: ['rev-parse', 'HEAD'] }),
    );
    expect(
      await runGit({
        workingDir: originDir,
        args: ['tag', '--list', '--format=%(contents)', 'v1.1.0'],
      }),
    ).toBe('Magic Free Disk Space 1.1.0');
  });

  test('refuses a malformed version', async () => {
    await expectRefusal({
      args: ['1.02.0'],
      stdinText: 'v1.02.0\n',
      errorText: 'error: 1.02.0 is not a version X.Y.Z without leading zeros',
      tagNames: [],
    });
    await expectRefusal({
      args: ['1.a.0'],
      stdinText: 'v1.a.0\n',
      errorText: 'error: 1.a.0 is not a version X.Y.Z without leading zeros',
      tagNames: [],
    });
  });

  test('refuses a version that is not newer than the latest release tag', async () => {
    await seedOriginTags(['v1.2.0']);

    await expectRefusal({
      args: ['1.1.0'],
      stdinText: 'v1.1.0\n',
      errorText: 'error: 1.1.0 is not newer than the latest release tag v1.2.0',
      tagNames: ['v1.2.0'],
    });
  });

  test('refuses a tag that exists on origin', async () => {
    await seedOriginTags(['v1.2.0']);

    await expectRefusal({
      args: ['1.2.0'],
      stdinText: 'v1.2.0\n',
      errorText: 'error: the tag v1.2.0 exists on origin already',
      tagNames: ['v1.2.0'],
    });
  });

  test('refuses a checkout that is not on main', async () => {
    await runGit({ workingDir: cloneDir, args: ['switch', '--quiet', '--create', 'feature'] });

    await expectRefusal({
      args: ['1.0.0'],
      stdinText: 'v1.0.0\n',
      errorText: 'error: HEAD is on feature, not on main',
      tagNames: [],
    });
  });

  test('refuses tracked changes and passes untracked files', async () => {
    await writeFile(join(cloneDir, 'untracked.txt'), 'untracked\n');

    const untrackedRun = await runTagRelease({ args: ['1.0.0'], stdinText: 'v1.0.0\n' });

    expect(untrackedRun.exitCode).toBe(0);

    await writeFile(join(cloneDir, 'README.md'), 'changed\n');

    await expectRefusal({
      args: ['1.1.0'],
      stdinText: 'v1.1.0\n',
      errorText: 'error: the checkout has uncommitted changes to tracked files',
      tagNames: ['v1.0.0'],
    });
  });

  test('refuses a main that is behind origin/main', async () => {
    const secondCloneDir = join(fixtureRoot.rootDir, 'second-clone');

    await runGit({
      workingDir: fixtureRoot.rootDir,
      args: ['clone', '--quiet', originDir, secondCloneDir],
    });
    await createCommit({
      workingDir: secondCloneDir,
      fileName: 'second.txt',
      message: 'Second commit',
    });
    await runGit({ workingDir: secondCloneDir, args: ['push', '--quiet', 'origin', 'main'] });

    await expectRefusal({
      args: ['1.0.0'],
      stdinText: 'v1.0.0\n',
      errorText: 'error: main is behind origin/main',
      tagNames: [],
    });
  });

  test('refuses a main that is ahead of origin/main', async () => {
    await createCommit({ workingDir: cloneDir, fileName: 'local.txt', message: 'Local commit' });

    await expectRefusal({
      args: ['1.0.0'],
      stdinText: 'v1.0.0\n',
      errorText: 'error: main is ahead of origin/main',
      tagNames: [],
    });
  });

  test('refuses a wrong confirmation and an empty stdin', async () => {
    await expectRefusal({
      args: ['1.0.0'],
      stdinText: '1.0.0\n',
      errorText: 'error: the answer was not v1.0.0; nothing was tagged',
      tagNames: [],
    });
    await expectRefusal({
      args: ['1.0.0'],
      stdinText: '',
      errorText: 'error: the answer was not v1.0.0; nothing was tagged',
      tagNames: [],
    });
  });

  test('refuses a local tag that origin lacks before the confirmation', async () => {
    await runGit({ workingDir: cloneDir, args: ['tag', 'v1.0.0'] });

    const run = await runTagRelease({ args: ['1.0.0'], stdinText: 'v1.0.0\n' });

    expect(run.exitCode).toBe(1);
    expect(run.stderrText).toContain(
      'error: a local tag v1.0.0 exists that origin lacks; delete it with git tag --delete v1.0.0, nothing was tagged',
    );
    expect(run.stdoutText).not.toContain('Type v1.0.0');
    expect(await loadTagNames(originDir)).toEqual([]);
  });

  test('deletes the local tag again when origin rejects the push', async () => {
    const hookPath = join(originDir, 'hooks/pre-receive');

    await writeFile(hookPath, '#!/bin/sh\nexit 1\n');
    await chmod(hookPath, 0o755);

    await expectRefusal({
      args: ['1.0.0'],
      stdinText: 'v1.0.0\n',
      errorText: 'error: the push of v1.0.0 to origin failed',
      tagNames: [],
    });
  });

  test('prints its usage unless given exactly one argument', async () => {
    for (const args of [[], ['1.0.0', '1.1.0']]) {
      const run = await runTagRelease({ args: args, stdinText: null });

      expect(run.exitCode).toBe(2);
      expect(run.stderrText).toStartWith('usage: ');
    }

    expect(await loadTagNames(originDir)).toEqual([]);
  });
});
