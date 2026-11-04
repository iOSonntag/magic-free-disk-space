import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EntryAttributeAccess } from '../../../src/platform/win32/removeTreeEntries.js';
import {
  classifyEntryRemovalFailure,
  removeTreeEntries,
} from '../../../src/platform/win32/removeTreeEntries.js';
import type { Result } from '../../../src/result.js';
import { buildTestEntryReads } from '../../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot, isPresent } from '../../support/fixtureRoot.js';
import { testOnPosix } from '../../support/posixOnly.js';

/** Reads no entry as evicted; the removal reads no private size. */
const ENTRY_READS = buildTestEntryReads({ privateBytes: null });

const FILE_ATTRIBUTE_READONLY = 0x1;

const FILE_ATTRIBUTE_REPARSE_POINT = 0x400;

/**
 * Attributes a test sets by path, normal for any other; a path of `failures` fails its every call
 * with the code given. Records each save.
 */
function buildFakeAttributes(params: {
  attributesByPath?: Map<string, number>;
  failures?: Map<string, string>;
}): { access: EntryAttributeAccess; saves: { path: string; attributes: number }[] } {
  const attributesByPath = params.attributesByPath ?? new Map<string, number>();
  const failures = params.failures ?? new Map<string, string>();
  const saves: { path: string; attributes: number }[] = [];

  function load(call: { path: string }): Result<number, string> {
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

  return { access: { load: load, save: save }, saves: saves };
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

    expect(
      await removeTreeEntries({ path: treePath, attributes: access, entryReads: ENTRY_READS }),
    ).toEqual({ kind: 'succeeded', value: { kind: 'removed' } });
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

    expect(
      await removeTreeEntries({ path: treePath, attributes: access, entryReads: ENTRY_READS }),
    ).toEqual({ kind: 'succeeded', value: { kind: 'removed' } });
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

    expect(
      await removeTreeEntries({ path: treePath, attributes: access, entryReads: ENTRY_READS }),
    ).toEqual({ kind: 'succeeded', value: { kind: 'partlyRemoved', stayedEntryCount: 1 } });
    expect(await readFile(join(junctionPath, 'b', 'leaf.bin'), 'utf8')).toBe('leaf');
    expect(await isPresent(join(treePath, 'top.bin'))).toBe(false);
  });

  test('leaves an entry kept only online, with the folders that hold it, and counts the entry alone', async () => {
    const evictedPath = join(treePath, 'a', 'b', 'leaf.bin');
    const { access } = buildFakeAttributes({});

    expect(
      await removeTreeEntries({
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

  test('leaves a file another program holds open and goes on with the rest', async () => {
    const heldPath = join(treePath, 'a', 'mid.bin');
    const { access } = buildFakeAttributes({ failures: new Map([[heldPath, 'EBUSY']]) });

    expect(
      await removeTreeEntries({ path: treePath, attributes: access, entryReads: ENTRY_READS }),
    ).toEqual({ kind: 'succeeded', value: { kind: 'partlyRemoved', stayedEntryCount: 1 } });
    expect(await readFile(heldPath, 'utf8')).toBe('mid');
    expect(await isPresent(join(treePath, 'a', 'b'))).toBe(false);
    expect(await isPresent(join(treePath, 'top.bin'))).toBe(false);
  });

  test('fails with the code of a denied entry', async () => {
    const deniedPath = join(treePath, 'top.bin');
    const { access } = buildFakeAttributes({ failures: new Map([[deniedPath, 'EPERM']]) });

    expect(
      await removeTreeEntries({ path: treePath, attributes: access, entryReads: ENTRY_READS }),
    ).toEqual({ kind: 'failed', failure: 'EPERM' });
    expect(await isPresent(deniedPath)).toBe(true);
  });

  test('removes a root that is a file, and fails for a root that is not there', async () => {
    const filePath = join(treePath, 'top.bin');
    const { access } = buildFakeAttributes({});

    expect(
      await removeTreeEntries({ path: filePath, attributes: access, entryReads: ENTRY_READS }),
    ).toEqual({ kind: 'succeeded', value: { kind: 'removed' } });
    expect(
      await removeTreeEntries({ path: filePath, attributes: access, entryReads: ENTRY_READS }),
    ).toEqual({ kind: 'failed', failure: 'ENOENT' });
  });

  test('fails a root that is one file held open, since nothing of it went', async () => {
    const filePath = join(treePath, 'top.bin');
    const { access } = buildFakeAttributes({ failures: new Map([[filePath, 'EBUSY']]) });

    expect(
      await removeTreeEntries({ path: filePath, attributes: access, entryReads: ENTRY_READS }),
    ).toEqual({ kind: 'failed', failure: 'EBUSY' });
  });

  testOnPosix('removes a link itself and never its target', async () => {
    const targetPath = join(fixtureRoot.rootDir, 'target');

    await mkdir(targetPath);
    await writeFile(join(targetPath, 'kept.bin'), 'kept');
    await symlink(targetPath, join(treePath, 'a', 'link'));

    const { access } = buildFakeAttributes({});

    expect(
      await removeTreeEntries({ path: treePath, attributes: access, entryReads: ENTRY_READS }),
    ).toEqual({ kind: 'succeeded', value: { kind: 'removed' } });
    expect(await readFile(join(targetPath, 'kept.bin'), 'utf8')).toBe('kept');
  });
});

describe('classifyEntryRemovalFailure', () => {
  test('reads a missing entry as gone, a held one as stayed, and any other code as failed', () => {
    expect(classifyEntryRemovalFailure({ code: 'ENOENT' })).toEqual({ kind: 'gone' });
    expect(classifyEntryRemovalFailure({ code: 'ENOTDIR' })).toEqual({ kind: 'gone' });
    expect(classifyEntryRemovalFailure({ code: 'EBUSY' })).toEqual({
      kind: 'stayed',
      code: 'EBUSY',
    });
    expect(classifyEntryRemovalFailure({ code: 'EPERM' })).toEqual({
      kind: 'failed',
      code: 'EPERM',
    });
  });
});
