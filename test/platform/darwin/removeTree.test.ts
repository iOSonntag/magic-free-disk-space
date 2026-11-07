import { afterEach, beforeEach, expect } from 'bun:test';
import { chmod, mkdir, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { removeTreeAsUser } from '../../../src/platform/darwin/removeTree.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  isPresent,
  writeFixtureTextFile,
} from '../../support/fixtureRoot.js';
import { describeOnPosix, testOnPosix } from '../../support/posixOnly.js';

const READ_ONLY_FOLDER_MODE = 0o555;

const userId = process.getuid?.() ?? 0;

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

/** A tree like Go's module cache: a read-only folder holding a file, inside `rootPath`. */
async function createReadOnlyTree(params: { rootPath: string }): Promise<string> {
  const folderPath = join(params.rootPath, 'example.com', 'module@v1.0.0');

  await writeFixtureTextFile({ path: join(folderPath, 'go.mod'), text: 'module example.com\n' });
  await chmod(folderPath, READ_ONLY_FOLDER_MODE);

  return folderPath;
}

describeOnPosix('removeTreeAsUser', () => {
  testOnPosix('adds owner write to a read-only folder the user owns and removes it', async () => {
    const rootPath = join(fixtureRoot.homeDir, 'go', 'pkg', 'mod');
    await createReadOnlyTree({ rootPath: rootPath });

    expect(await removeTreeAsUser({ path: rootPath, userId: userId })).toEqual({
      kind: 'succeeded',
      value: null,
    });
    expect(await isPresent(rootPath)).toBe(false);
  });

  testOnPosix('leaves a read-only folder of another owner, failing with EACCES', async () => {
    const rootPath = join(fixtureRoot.homeDir, 'go', 'pkg', 'mod');
    const folderPath = await createReadOnlyTree({ rootPath: rootPath });

    expect(await removeTreeAsUser({ path: rootPath, userId: userId + 1 })).toEqual({
      kind: 'failed',
      failure: 'EACCES',
    });
    expect(await isPresent(join(folderPath, 'go.mod'))).toBe(true);
    expect((await stat(folderPath)).mode & 0o777).toBe(READ_ONLY_FOLDER_MODE);
  });

  testOnPosix('removes a link to a read-only folder outside and leaves its target', async () => {
    const rootPath = join(fixtureRoot.homeDir, 'go', 'pkg', 'mod');
    await createReadOnlyTree({ rootPath: rootPath });
    const outsidePath = join(fixtureRoot.rootDir, 'outside');
    await writeFixtureTextFile({ path: join(outsidePath, 'keep.txt'), text: 'keep\n' });
    await chmod(outsidePath, READ_ONLY_FOLDER_MODE);
    await symlink(outsidePath, join(rootPath, 'linked'));

    expect(await removeTreeAsUser({ path: rootPath, userId: userId })).toEqual({
      kind: 'succeeded',
      value: null,
    });
    expect(await isPresent(rootPath)).toBe(false);
    expect(await isPresent(join(outsidePath, 'keep.txt'))).toBe(true);
    expect((await stat(outsidePath)).mode & 0o777).toBe(READ_ONLY_FOLDER_MODE);
  });

  testOnPosix('changes no mode when the first removal succeeds', async () => {
    const rootPath = join(fixtureRoot.homeDir, 'cache');
    await mkdir(join(rootPath, 'inner'), { recursive: true });

    expect(await removeTreeAsUser({ path: rootPath, userId: null })).toEqual({
      kind: 'succeeded',
      value: null,
    });
    expect(await isPresent(rootPath)).toBe(false);
  });
});
