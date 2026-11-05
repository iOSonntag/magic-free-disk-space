import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { copyFile, mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EntryAttributeAccess } from '../../../src/platform/win32/removeTreeEntries.js';
import {
  decideEntryRemovalEnd,
  removeTreeEntries,
} from '../../../src/platform/win32/removeTreeEntries.js';
import type { Result } from '../../../src/result.js';
import type { EntryReads } from '../../../src/system/entryReads.js';
import { buildTestEntryReads } from '../../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot, isPresent } from '../../support/fixtureRoot.js';
import { buildTestHostPath, HOST_PATH_RULES } from '../../support/parsedValueFixtures.js';
import { testOnPosix } from '../../support/posixOnly.js';

/** Reads no entry as evicted; the removal reads no private size. */
const ENTRY_READS = buildTestEntryReads({ privateBytes: null });

const FILE_ATTRIBUTE_READONLY = 0x1;

const FILE_ATTRIBUTE_REPARSE_POINT = 0x400;

const MAX_CONCURRENT_REMOVALS = 16;

/**
 * Attributes a test sets by path, normal for any other; a path of `failures` fails its every call
 * with the code given. Records each load and each save.
 */
function buildFakeAttributes(params: {
  attributesByPath?: Map<string, number>;
  failures?: Map<string, string>;
}): {
  access: EntryAttributeAccess;
  loadedPaths: string[];
  saves: { path: string; attributes: number }[];
} {
  const attributesByPath = params.attributesByPath ?? new Map<string, number>();
  const failures = params.failures ?? new Map<string, string>();
  const loadedPaths: string[] = [];
  const saves: { path: string; attributes: number }[] = [];

  function load(call: { path: string }): Result<number, string> {
    loadedPaths.push(call.path);

    const failure = failures.get(call.path);

    if (failure !== undefined) {
      return { kind: 'failed', failure: failure };
    }

    return { kind: 'succeeded', value: attributesByPath.get(call.path) ?? 0 };
  }

  function save(call: { path: string; attributes: number }): Result<null, string> {
    const failure = failures.get(call.path);

    if (failure !== undefined) {
      return { kind: 'failed', failure: failure };
    }

    saves.push(call);
    attributesByPath.set(call.path, call.attributes);

    return { kind: 'succeeded', value: null };
  }

  return { access: { load: load, save: save }, loadedPaths: loadedPaths, saves: saves };
}

/** Removes the host path `path` under the host's rules, with no entry evicted unless given. */
function removeTestTree(params: {
  path: string;
  attributes: EntryAttributeAccess;
  entryReads?: EntryReads;
}): ReturnType<typeof removeTreeEntries> {
  return removeTreeEntries({
    rootPath: buildTestHostPath({ text: params.path }),
    rules: HOST_PATH_RULES,
    attributes: params.attributes,
    entryReads: params.entryReads ?? ENTRY_READS,
  });
}

let fixtureRoot: FixtureRoot;
let treePath: string;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  treePath = join(fixtureRoot.homeDir, 'cache');
  await mkdir(join(treePath, 'a', 'b'), { recursive: true });
  await writeFile(join(treePath, 'top.bin'), 'top');
  await writeFile(join(treePath, 'a', 'mid.bin'), 'mid');
  await writeFile(join(treePath, 'a', 'b', 'leaf.bin'), 'leaf');
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

describe('removeTreeEntries', () => {
  test('removes a whole tree, the root last', async () => {
    const { access } = buildFakeAttributes({});

    expect(await removeTestTree({ path: treePath, attributes: access })).toEqual({
      kind: 'succeeded',
      value: { kind: 'removed' },
    });
    expect(await isPresent(treePath)).toBe(false);
  });

  test('clears the read-only bit of a file and a folder right before it goes, and only theirs', async () => {
    const readOnlyFilePath = join(treePath, 'a', 'mid.bin');
    const readOnlyFolderPath = join(treePath, 'a', 'b');
    const { access, saves } = buildFakeAttributes({
      attributesByPath: new Map([
        [readOnlyFilePath, FILE_ATTRIBUTE_READONLY | 0x20],
        [readOnlyFolderPath, FILE_ATTRIBUTE_READONLY | 0x10],
      ]),
    });

    expect(await removeTestTree({ path: treePath, attributes: access })).toEqual({
      kind: 'succeeded',
      value: { kind: 'removed' },
    });
    expect(saves.toSorted((left, right) => left.path.localeCompare(right.path))).toEqual([
      { path: readOnlyFolderPath, attributes: 0x10 },
      { path: readOnlyFilePath, attributes: 0x20 },
    ]);
  });

  test('never enters a folder with a reparse point, and leaves one that holds entries', async () => {
    const junctionPath = join(treePath, 'a');
    const { access } = buildFakeAttributes({
      attributesByPath: new Map([[junctionPath, FILE_ATTRIBUTE_REPARSE_POINT | 0x10]]),
    });

    expect(await removeTestTree({ path: treePath, attributes: access })).toEqual({
      kind: 'succeeded',
      value: { kind: 'partlyRemoved', stayedEntryCount: 1 },
    });
    expect(await readFile(join(junctionPath, 'b', 'leaf.bin'), 'utf8')).toBe('leaf');
    expect(await isPresent(join(treePath, 'top.bin'))).toBe(false);
  });

  test('leaves an entry kept only online, with the folders that hold it, and counts the entry alone', async () => {
    const evictedPath = join(treePath, 'a', 'b', 'leaf.bin');
    const { access } = buildFakeAttributes({});

    expect(
      await removeTestTree({
        path: treePath,
        attributes: access,
        entryReads: buildTestEntryReads({
          privateBytes: null,
          isEntryEvicted: (entry) => entry.path === evictedPath,
        }),
      }),
    ).toEqual({ kind: 'succeeded', value: { kind: 'partlyRemoved', stayedEntryCount: 1 } });
    expect(await readFile(evictedPath, 'utf8')).toBe('leaf');
    expect(await isPresent(join(treePath, 'a', 'mid.bin'))).toBe(false);
  });

  test('leaves a root file kept only online, which nothing removes', async () => {
    const filePath = join(treePath, 'top.bin');
    const { access } = buildFakeAttributes({});

    expect(
      await removeTestTree({
        path: filePath,
        attributes: access,
        entryReads: buildTestEntryReads({
          privateBytes: null,
          isEntryEvicted: (entry) => entry.path === filePath && entry.kind === 'file',
        }),
      }),
    ).toEqual({ kind: 'succeeded', value: { kind: 'partlyRemoved', stayedEntryCount: 1 } });
    expect(await readFile(filePath, 'utf8')).toBe('top');
  });

  test('leaves a file another program holds open and goes on with the rest', async () => {
    const heldPath = join(treePath, 'a', 'mid.bin');
    const { access } = buildFakeAttributes({ failures: new Map([[heldPath, 'EBUSY']]) });

    expect(await removeTestTree({ path: treePath, attributes: access })).toEqual({
      kind: 'succeeded',
      value: { kind: 'partlyRemoved', stayedEntryCount: 1 },
    });
    expect(await readFile(heldPath, 'utf8')).toBe('mid');
    expect(await isPresent(join(treePath, 'a', 'b'))).toBe(false);
    expect(await isPresent(join(treePath, 'top.bin'))).toBe(false);
  });

  test('leaves a file Windows refuses and goes on with the rest', async () => {
    const refusedPath = join(treePath, 'a', 'mid.bin');
    const deniedPath = join(treePath, 'top.bin');
    const { access } = buildFakeAttributes({
      failures: new Map([
        [refusedPath, 'EPERM'],
        [deniedPath, 'EACCES'],
      ]),
    });

    expect(await removeTestTree({ path: treePath, attributes: access })).toEqual({
      kind: 'succeeded',
      value: { kind: 'partlyRemoved', stayedEntryCount: 2 },
    });
    expect(await readFile(refusedPath, 'utf8')).toBe('mid');
    expect(await readFile(deniedPath, 'utf8')).toBe('top');
    expect(await isPresent(join(treePath, 'a', 'b'))).toBe(false);
  });

  test('fails with the code of an entry that failed for another reason', async () => {
    const failedPath = join(treePath, 'top.bin');
    const { access } = buildFakeAttributes({ failures: new Map([[failedPath, 'EIO']]) });

    expect(await removeTestTree({ path: treePath, attributes: access })).toEqual({
      kind: 'failed',
      failure: 'EIO',
    });
    expect(await isPresent(failedPath)).toBe(true);
  });

  test('starts no removal after the first failure', async () => {
    const wideTreePath = join(fixtureRoot.homeDir, 'wide');
    const filePaths = Array.from({ length: MAX_CONCURRENT_REMOVALS * 3 }, (_, index) =>
      join(wideTreePath, `${index}.bin`),
    );
    await mkdir(wideTreePath);
    await Promise.all(filePaths.map((filePath) => writeFile(filePath, 'wide')));
    const { access, loadedPaths } = buildFakeAttributes({
      failures: new Map(filePaths.map((filePath) => [filePath, 'EIO'])),
    });

    expect(await removeTestTree({ path: wideTreePath, attributes: access })).toEqual({
      kind: 'failed',
      failure: 'EIO',
    });
    expect(
      loadedPaths.filter((loadedPath) => filePaths.includes(loadedPath)).length,
    ).toBeLessThanOrEqual(MAX_CONCURRENT_REMOVALS);
  });

  test('removes a root that is a file, and fails for a root that is not there', async () => {
    const filePath = join(treePath, 'top.bin');
    const { access } = buildFakeAttributes({});

    expect(await removeTestTree({ path: filePath, attributes: access })).toEqual({
      kind: 'succeeded',
      value: { kind: 'removed' },
    });
    expect(await removeTestTree({ path: filePath, attributes: access })).toEqual({
      kind: 'failed',
      failure: 'ENOENT',
    });
  });

  test('fails a root that is one file held open or refused, since nothing of it went', async () => {
    const filePath = join(treePath, 'top.bin');

    for (const code of ['EBUSY', 'EPERM']) {
      const { access } = buildFakeAttributes({ failures: new Map([[filePath, code]]) });

      expect(await removeTestTree({ path: filePath, attributes: access })).toEqual({
        kind: 'failed',
        failure: code,
      });
    }

    expect(await readFile(filePath, 'utf8')).toBe('top');
  });

  testOnPosix('removes a link itself and never its target', async () => {
    const targetPath = join(fixtureRoot.rootDir, 'target');

    await mkdir(targetPath);
    await writeFile(join(targetPath, 'kept.bin'), 'kept');
    await symlink(targetPath, join(treePath, 'a', 'link'));

    const { access } = buildFakeAttributes({});

    expect(await removeTestTree({ path: treePath, attributes: access })).toEqual({
      kind: 'succeeded',
      value: { kind: 'removed' },
    });
    expect(await readFile(join(targetPath, 'kept.bin'), 'utf8')).toBe('kept');
  });
});

describe('decideEntryRemovalEnd', () => {
  test('reads a missing entry as gone and a held one as stayed, of any kind', () => {
    for (const entryKind of ['file', 'link', 'directory'] as const) {
      expect(decideEntryRemovalEnd({ code: 'ENOENT', entryKind: entryKind })).toEqual({
        kind: 'gone',
      });
      expect(decideEntryRemovalEnd({ code: 'ENOTDIR', entryKind: entryKind })).toEqual({
        kind: 'gone',
      });
      expect(decideEntryRemovalEnd({ code: 'EBUSY', entryKind: entryKind })).toEqual({
        kind: 'stayed',
        code: 'EBUSY',
      });
      expect(decideEntryRemovalEnd({ code: 'EIO', entryKind: entryKind })).toEqual({
        kind: 'failed',
        code: 'EIO',
      });
    }
  });

  test('reads a refused file as stayed, and a refused link or folder as failed', () => {
    for (const code of ['EPERM', 'EACCES']) {
      expect(decideEntryRemovalEnd({ code: code, entryKind: 'file' })).toEqual({
        kind: 'stayed',
        code: code,
      });
      expect(decideEntryRemovalEnd({ code: code, entryKind: 'link' })).toEqual({
        kind: 'failed',
        code: code,
      });
      expect(decideEntryRemovalEnd({ code: code, entryKind: 'directory' })).toEqual({
        kind: 'failed',
        code: code,
      });
    }
  });
});

describe.skipIf(process.platform !== 'win32')('the removal of a running program on NTFS', () => {
  test('leaves a program that runs and removes the files beside it', async () => {
    const systemRootPath = process.env.SystemRoot;

    if (systemRootPath === undefined) {
      throw new Error('Windows names no SystemRoot.');
    }

    const programTreePath = join(fixtureRoot.homeDir, 'unpacked');
    const programPath = join(programTreePath, 'ping.exe');
    const firstPath = join(programTreePath, 'first.bin');
    const secondPath = join(programTreePath, 'second.bin');
    await mkdir(programTreePath);
    await copyFile(join(systemRootPath, 'System32', 'ping.exe'), programPath);
    await writeFile(firstPath, 'first');
    await writeFile(secondPath, 'second');
    const { access } = buildFakeAttributes({});
    // Windows maps a program's image before its process starts, and refuses to delete it since.
    const program = Bun.spawn([programPath, '-n', '60', '127.0.0.1'], {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });

    try {
      expect(await removeTestTree({ path: programTreePath, attributes: access })).toEqual({
        kind: 'succeeded',
        value: { kind: 'partlyRemoved', stayedEntryCount: 1 },
      });
      expect((await stat(programPath)).isFile()).toBe(true);
      expect(await isPresent(firstPath)).toBe(false);
      expect(await isPresent(secondPath)).toBe(false);
    } finally {
      program.kill();
      await program.exited;
    }
  });
});
