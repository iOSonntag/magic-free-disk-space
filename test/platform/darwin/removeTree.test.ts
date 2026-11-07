import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { TreeRemovalUser } from '../../../src/platform/darwin/removeTree.js';
import {
  decideFolderWriteChange,
  removeTreeAsUser,
} from '../../../src/platform/darwin/removeTree.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  isPresent,
  writeFixtureTextFile,
} from '../../support/fixtureRoot.js';
import { describeOnPosix } from '../../support/posixOnly.js';

const READ_ONLY_FOLDER_MODE = 0o555;

const WRITABLE_FOLDER_MODE = 0o755;

const processUser: TreeRemovalUser = {
  id: process.getuid?.() ?? 0,
  groupIds: process.getgroups?.() ?? [],
};

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

/** Gives each folder owner write again, so the fixture cleanup can delete what is left. */
async function restoreWritableFolders(params: { folderPaths: string[] }): Promise<void> {
  for (const folderPath of params.folderPaths) {
    if (await isPresent(folderPath)) {
      await chmod(folderPath, WRITABLE_FOLDER_MODE);
    }
  }
}

async function loadPermissionMode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

describeOnPosix('removeTreeAsUser', () => {
  test('adds owner write to a read-only folder the user owns and removes it', async () => {
    const rootPath = join(fixtureRoot.homeDir, 'go', 'pkg', 'mod');
    const folderPath = await createReadOnlyTree({ rootPath: rootPath });

    try {
      expect(await removeTreeAsUser({ path: rootPath, user: processUser })).toEqual({
        kind: 'succeeded',
        value: null,
      });
      expect(await isPresent(rootPath)).toBe(false);
    } finally {
      await restoreWritableFolders({ folderPaths: [folderPath] });
    }
  });

  test('removes a tree with more read-only folders than are visited at once', async () => {
    const rootPath = join(fixtureRoot.homeDir, 'go', 'pkg', 'mod');
    const folderPaths = Array.from({ length: 40 }, (_, i) =>
      join(rootPath, `example.com/module${i}@v1.0.0`),
    );

    for (const folderPath of folderPaths) {
      await writeFixtureTextFile({ path: join(folderPath, 'go.mod'), text: 'module x\n' });
      await chmod(folderPath, READ_ONLY_FOLDER_MODE);
    }

    try {
      expect(await removeTreeAsUser({ path: rootPath, user: processUser })).toEqual({
        kind: 'succeeded',
        value: null,
      });
      expect(await isPresent(rootPath)).toBe(false);
    } finally {
      await restoreWritableFolders({ folderPaths: folderPaths });
    }
  });

  test('leaves a read-only folder of another owner, failing with EACCES', async () => {
    const rootPath = join(fixtureRoot.homeDir, 'go', 'pkg', 'mod');
    const folderPath = await createReadOnlyTree({ rootPath: rootPath });
    const otherUser: TreeRemovalUser = { id: processUser.id + 1, groupIds: [] };

    try {
      expect(await removeTreeAsUser({ path: rootPath, user: otherUser })).toEqual({
        kind: 'failed',
        failure: 'EACCES',
      });
      expect(await isPresent(join(folderPath, 'go.mod'))).toBe(true);
      expect(await loadPermissionMode(folderPath)).toBe(READ_ONLY_FOLDER_MODE);
    } finally {
      await restoreWritableFolders({ folderPaths: [folderPath] });
    }
  });

  test('removes a link to a read-only folder outside and leaves its target', async () => {
    const rootPath = join(fixtureRoot.homeDir, 'go', 'pkg', 'mod');
    const folderPath = await createReadOnlyTree({ rootPath: rootPath });
    const outsidePath = join(fixtureRoot.rootDir, 'outside');
    await writeFixtureTextFile({ path: join(outsidePath, 'keep.txt'), text: 'keep\n' });
    await chmod(outsidePath, READ_ONLY_FOLDER_MODE);
    await symlink(outsidePath, join(rootPath, 'linked'));

    try {
      expect(await removeTreeAsUser({ path: rootPath, user: processUser })).toEqual({
        kind: 'succeeded',
        value: null,
      });
      expect(await isPresent(rootPath)).toBe(false);
      expect(await isPresent(join(outsidePath, 'keep.txt'))).toBe(true);
      expect(await loadPermissionMode(outsidePath)).toBe(READ_ONLY_FOLDER_MODE);
    } finally {
      await restoreWritableFolders({ folderPaths: [folderPath, outsidePath] });
    }
  });

  test('never lists a link that is the item itself, so its read-only target keeps its mode', async () => {
    const parentPath = join(fixtureRoot.homeDir, 'parent');
    const outsidePath = join(fixtureRoot.rootDir, 'outside', 'ro');
    const outsideChildPath = join(outsidePath, 'inner');
    await writeFixtureTextFile({ path: join(outsideChildPath, 'keep.txt'), text: 'keep\n' });
    await mkdir(parentPath, { recursive: true });
    await symlink(outsidePath, join(parentPath, 'item'));
    const readOnlyPaths = [outsideChildPath, outsidePath, parentPath];

    for (const readOnlyPath of readOnlyPaths) {
      await chmod(readOnlyPath, READ_ONLY_FOLDER_MODE);
    }

    try {
      expect(await removeTreeAsUser({ path: join(parentPath, 'item'), user: processUser })).toEqual(
        { kind: 'failed', failure: 'EACCES' },
      );
      expect(await loadPermissionMode(outsidePath)).toBe(READ_ONLY_FOLDER_MODE);
      expect(await loadPermissionMode(outsideChildPath)).toBe(READ_ONLY_FOLDER_MODE);
    } finally {
      await restoreWritableFolders({ folderPaths: readOnlyPaths });
    }
  });

  test('changes no mode for a platform without user ids', async () => {
    const rootPath = join(fixtureRoot.homeDir, 'go', 'pkg', 'mod');
    const folderPath = await createReadOnlyTree({ rootPath: rootPath });

    try {
      expect(await removeTreeAsUser({ path: rootPath, user: null })).toMatchObject({
        kind: 'failed',
      });
      expect(await loadPermissionMode(folderPath)).toBe(READ_ONLY_FOLDER_MODE);
    } finally {
      await restoreWritableFolders({ folderPaths: [folderPath] });
    }
  });
});

describe('decideFolderWriteChange', () => {
  const user: TreeRemovalUser = { id: 501, groupIds: [20] };

  test('denies a folder of another owner that only its owner can write', () => {
    expect(decideFolderWriteChange({ mode: 0o40755, ownerId: 0, groupId: 0, user: user })).toBe(
      'denied',
    );
  });

  test('denies a folder of another owner that a group of others can write', () => {
    expect(decideFolderWriteChange({ mode: 0o40775, ownerId: 0, groupId: 0, user: user })).toBe(
      'denied',
    );
  });

  test('leaves a folder of another owner that a group of the user can write', () => {
    expect(decideFolderWriteChange({ mode: 0o40775, ownerId: 0, groupId: 20, user: user })).toBe(
      'none',
    );
  });

  test('leaves a folder of another owner that everyone can write', () => {
    expect(decideFolderWriteChange({ mode: 0o40777, ownerId: 0, groupId: 0, user: user })).toBe(
      'none',
    );
  });

  test('adds owner write to a read-only folder of the user', () => {
    expect(decideFolderWriteChange({ mode: 0o40555, ownerId: 501, groupId: 20, user: user })).toBe(
      'addOwnerWrite',
    );
  });

  test('leaves a folder of the user that has owner write', () => {
    expect(decideFolderWriteChange({ mode: 0o40755, ownerId: 501, groupId: 20, user: user })).toBe(
      'none',
    );
  });

  test('leaves every folder to the superuser', () => {
    const superuser: TreeRemovalUser = { id: 0, groupIds: [0] };

    expect(
      decideFolderWriteChange({ mode: 0o40555, ownerId: 501, groupId: 20, user: superuser }),
    ).toBe('none');
  });
});
