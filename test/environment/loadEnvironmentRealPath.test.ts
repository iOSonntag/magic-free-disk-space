import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  loadEnvironmentRealPath,
  loadExistingRealPaths,
} from '../../src/environment/loadEnvironmentRealPath.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';
import { buildTestHostPath, hostPathRules } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

describe('loadEnvironmentRealPath', () => {
  testOnPosix('resolves a link to the folder it points to', async () => {
    const folderPath = join(fixtureRoot.homeDir, 'folder');
    const linkPath = buildTestHostPath({ text: join(fixtureRoot.homeDir, 'link') });
    await createFixtureDirectory({ path: folderPath });
    await symlink(folderPath, linkPath);

    expect(await loadEnvironmentRealPath({ pathRules: hostPathRules, path: linkPath })).toEqual({
      kind: 'succeeded',
      value: buildTestHostPath({ text: await realpath(folderPath) }),
    });
  });

  test('is unresolvable at the path with the code of the error when nothing is there', async () => {
    const missingPath = buildTestHostPath({ text: join(fixtureRoot.homeDir, 'missing') });

    expect(await loadEnvironmentRealPath({ pathRules: hostPathRules, path: missingPath })).toEqual({
      kind: 'failed',
      failure: { reason: 'unresolvable', path: missingPath, code: 'ENOENT' },
    });
  });

  test('is unresolvable at the path when its real path is no absolute path under the rules', async () => {
    // The rules of the other platform, under which no real path of the host is absolute.
    const otherRules = process.platform === 'win32' ? POSIX_PATH_RULES : WIN32_PATH_RULES;

    expect(
      await loadEnvironmentRealPath({ pathRules: otherRules, path: fixtureRoot.homeDir }),
    ).toEqual({
      kind: 'failed',
      failure: { reason: 'unresolvable', path: fixtureRoot.homeDir, code: 'notAbsolute' },
    });
  });
});

describe('loadExistingRealPaths', () => {
  test('keeps the real path of each folder that is there, in their order', async () => {
    const realPaths = await loadExistingRealPaths({
      pathRules: hostPathRules,
      paths: [
        fixtureRoot.tempDir,
        buildTestHostPath({ text: join(fixtureRoot.homeDir, 'missing') }),
        fixtureRoot.homeDir,
      ],
    });

    expect(realPaths).toEqual([
      buildTestHostPath({ text: await realpath(fixtureRoot.tempDir) }),
      buildTestHostPath({ text: await realpath(fixtureRoot.homeDir) }),
    ]);
  });
});
