import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { decideReleaseTag } from '../../scripts/release/decideReleaseTag.js';
import type { FixtureCommandRun } from '../support/fixtureCommand.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { describeOnPosix } from '../support/posixOnly.js';
import { runFixtureCommand } from './releaseScriptFixtures.js';

const decideReleaseTagPath = join(import.meta.dir, '../../scripts/release/decideReleaseTag.ts');

describe('decideReleaseTag', () => {
  test('refuses a version that is not X.Y.Z without leading zeros', () => {
    for (const versionText of ['1.02.0', '1.a.0', 'v1.2.0', '1.2', '']) {
      expect(decideReleaseTag({ versionText: versionText, remoteTagNames: [] })).toEqual({
        kind: 'refused',
        reason: 'malformedVersion',
      });
    }
  });

  test('refuses a version older than the latest release tag, ignoring other tags', () => {
    const remoteTagNames = ['v1.0.0', 'v1.2.0', 'v1.02.0', 'v1.30.0-beta', 'nightly', '9.0.0'];

    expect(decideReleaseTag({ versionText: '1.1.0', remoteTagNames: remoteTagNames })).toEqual({
      kind: 'refused',
      reason: 'notNewer',
      latestTag: 'v1.2.0',
    });
  });

  test('refuses a tag that exists on origin, also when it is the latest', () => {
    // Only the canonical vX.Y.Z counts as a release tag, so an equal version always finds its tag.
    expect(
      decideReleaseTag({ versionText: '1.2.0', remoteTagNames: ['v1.0.0', 'v1.2.0', 'nightly'] }),
    ).toEqual({ kind: 'refused', reason: 'tagExists', tag: 'v1.2.0' });
  });

  test('accepts a version with no tags at all', () => {
    expect(decideReleaseTag({ versionText: '0.1.0', remoteTagNames: [] })).toEqual({
      kind: 'accepted',
      tag: 'v0.1.0',
    });
  });

  test('accepts a version newer than every release tag, ignoring other tags', () => {
    expect(
      decideReleaseTag({ versionText: '1.3.0', remoteTagNames: ['v1.2.0', 'v1.0.0', 'v1.20.0x'] }),
    ).toEqual({ kind: 'accepted', tag: 'v1.3.0' });
  });

  test('orders the parts numerically, v1.9.0 before v1.10.0', () => {
    expect(decideReleaseTag({ versionText: '1.10.0', remoteTagNames: ['v1.9.0'] })).toEqual({
      kind: 'accepted',
      tag: 'v1.10.0',
    });
    expect(
      decideReleaseTag({ versionText: '1.9.1', remoteTagNames: ['v1.10.0', 'v1.9.0'] }),
    ).toEqual({ kind: 'refused', reason: 'notNewer', latestTag: 'v1.10.0' });
  });
});

describeOnPosix('the command decideReleaseTag.ts', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  async function runDecideReleaseTagCommand(
    commandArguments: string[],
  ): Promise<FixtureCommandRun> {
    return runFixtureCommand({
      fixtureRoot: fixtureRoot,
      workingDir: fixtureRoot.rootDir,
      command: ['bun', decideReleaseTagPath, ...commandArguments],
      stdinText: null,
    });
  }

  test('prints the tag of an accepted version', async () => {
    expect(await runDecideReleaseTagCommand(['1.3.0', 'v1.2.0', 'nightly'])).toEqual({
      exitCode: 0,
      stdoutText: 'v1.3.0\n',
      stderrText: '',
    });
  });

  test('names a malformed version', async () => {
    expect(await runDecideReleaseTagCommand(['1.02.0'])).toEqual({
      exitCode: 1,
      stdoutText: '',
      stderrText: 'error: 1.02.0 is not a version X.Y.Z without leading zeros\n',
    });
  });

  test('names a tag that exists', async () => {
    expect(await runDecideReleaseTagCommand(['1.2.0', 'v1.2.0'])).toEqual({
      exitCode: 1,
      stdoutText: '',
      stderrText: 'error: the tag v1.2.0 exists on origin already\n',
    });
  });

  test('names the latest release tag a version is not newer than', async () => {
    expect(await runDecideReleaseTagCommand(['1.1.0', 'v1.2.0'])).toEqual({
      exitCode: 1,
      stdoutText: '',
      stderrText: 'error: 1.1.0 is not newer than the latest release tag v1.2.0\n',
    });
  });

  test('prints its usage without a version', async () => {
    const run = await runDecideReleaseTagCommand([]);

    expect(run.exitCode).toBe(2);
    expect(run.stdoutText).toBe('');
    expect(run.stderrText).toStartWith('usage: ');
  });
});
