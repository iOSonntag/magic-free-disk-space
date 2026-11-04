import { rmdir, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { TreeRemoval } from '../../delete/deletePlatform.js';
import type { Result } from '../../result.js';
import type { EntryReads } from '../../system/entryReads.js';
import { getErrorCode } from '../../system/getErrorCode.js';
import { loadEntryStats } from '../../system/loadEntryStats.js';
import type { TreeEntry, TreeEntryVisit } from '../../system/walkDirectoryTree.js';
import { walkDirectoryTree } from '../../system/walkDirectoryTree.js';

/** The entry cannot be deleted until this bit is cleared. */
const FILE_ATTRIBUTE_READONLY = 0x1;

/** The folder is a link or another program's placeholder, whose content is not its own. */
const FILE_ATTRIBUTE_REPARSE_POINT = 0x400;

const MAX_CONCURRENT_DIRECTORIES = 16;

const MAX_CONCURRENT_REMOVALS = 16;

/** The codes of an entry that is gone already, or whose folder is. */
const GONE_CODES = ['ENOENT', 'ENOTDIR'];

/** The codes of an entry another program holds open, which stays where it is. */
const IN_USE_CODES = ['EBUSY'];

/**
 * Reads and sets the `FILE_ATTRIBUTE_*` bits of an entry, never following a link. A failure is the
 * error code of the call, `ENOENT` for an entry that is gone.
 */
export type EntryAttributeAccess = {
  load: (params: { path: string }) => Result<number, string>;
  save: (params: { path: string; attributes: number }) => Result<null, string>;
};

/** How the removal of one entry ended; one that stayed or failed carries the code of its call. */
export type EntryRemovalEnd =
  | { kind: 'gone' }
  | { kind: 'stayed'; code: string }
  | { kind: 'failed'; code: string };

/** A file, or a link of any kind, which goes as one entry. */
type LeafTarget = { path: string; kind: 'file' | 'link' };

type DirectoryTarget = { path: string; depth: number };

type RemovalTargets = { leaves: LeafTarget[]; directories: DirectoryTarget[] };

/** A folder's removal ends as an entry's does, or finds it still holds entries. */
type DirectoryRemovalEnd = EntryRemovalEnd | { kind: 'notEmpty' };

/**
 * Removes the tree at `path` entry by entry, as Windows needs it: the walk never enters a link,
 * a junction, or any other folder with a reparse point, and each is removed itself, never its
 * target. Each file and folder loses its read-only bit right before its removal. A file another
 * program holds open stays, and so does an entry `entryReads.isEntryEvicted` finds online only,
 * which a removal would delete from its cloud store; the folders that hold them stay with them.
 * Any other failure ends the removal with its code; an unreadable folder ends it before anything
 * is removed. Never throws.
 */
export async function removeTreeEntries(params: {
  path: string;
  attributes: EntryAttributeAccess;
  entryReads: EntryReads;
}): Promise<Result<TreeRemoval, string>> {
  const rootPath = resolve(params.path);
  const rootStats = await loadEntryStats({ path: rootPath });

  if (rootStats.kind === 'failed') {
    return { kind: 'failed', failure: rootStats.failure.code };
  }

  switch (rootStats.value.kind) {
    case 'file':
    case 'other':
      return removeRootLeaf({
        target: { path: rootPath, kind: 'file' },
        attributes: params.attributes,
      });
    case 'symbolicLink':
      return removeRootLeaf({
        target: { path: rootPath, kind: 'link' },
        attributes: params.attributes,
      });
    case 'directory': {
      const rootAttributes = params.attributes.load({ path: rootPath });

      if (rootAttributes.kind === 'failed') {
        return { kind: 'failed', failure: rootAttributes.failure };
      }

      if (isReparsePoint({ attributes: rootAttributes.value })) {
        return removeRootLeaf({
          target: { path: rootPath, kind: 'link' },
          attributes: params.attributes,
        });
      }

      return removeDirectoryTree({
        rootPath: rootPath,
        attributes: params.attributes,
        entryReads: params.entryReads,
      });
    }
  }
}

/** How a failed removal call of one entry ends: gone already, held open by another program, or failed. */
export function classifyEntryRemovalFailure(params: { code: string }): EntryRemovalEnd {
  if (GONE_CODES.includes(params.code)) {
    return { kind: 'gone' };
  }

  if (IN_USE_CODES.includes(params.code)) {
    return { kind: 'stayed', code: params.code };
  }

  return { kind: 'failed', code: params.code };
}

/** A path that is a single entry fails with its code when it stays: nothing of it went. */
async function removeRootLeaf(params: {
  target: LeafTarget;
  attributes: EntryAttributeAccess;
}): Promise<Result<TreeRemoval, string>> {
  const end = await removeLeafEntry({ target: params.target, attributes: params.attributes });

  switch (end.kind) {
    case 'gone':
      return { kind: 'succeeded', value: { kind: 'removed' } };
    case 'stayed':
    case 'failed':
      return { kind: 'failed', failure: end.code };
  }
}

/**
 * Lists the whole tree first, then removes its files and links, then its folders from the deepest
 * up, the root last. A folder that still holds an entry that stayed stays without being counted.
 */
async function removeDirectoryTree(params: {
  rootPath: string;
  attributes: EntryAttributeAccess;
  entryReads: EntryReads;
}): Promise<Result<TreeRemoval, string>> {
  const tally = createStayedTally({ rootPath: params.rootPath });
  const listing = await listRemovalTargets({
    rootPath: params.rootPath,
    attributes: params.attributes,
    entryReads: params.entryReads,
    tally: tally,
  });

  if (listing.kind === 'failed') {
    return listing;
  }

  const leafFailure = await removeLeafTargets({
    targets: listing.value.leaves,
    attributes: params.attributes,
    tally: tally,
  });

  if (leafFailure !== null) {
    return { kind: 'failed', failure: leafFailure };
  }

  const directoryFailure = await removeDirectoryTargets({
    directories: [...listing.value.directories, { path: params.rootPath, depth: 0 }],
    attributes: params.attributes,
    tally: tally,
  });

  if (directoryFailure !== null) {
    return { kind: 'failed', failure: directoryFailure };
  }

  const stayedEntryCount = tally.count();

  if (stayedEntryCount === 0) {
    return { kind: 'succeeded', value: { kind: 'removed' } };
  }

  return {
    kind: 'succeeded',
    value: { kind: 'partlyRemoved', stayedEntryCount: stayedEntryCount },
  };
}

/**
 * Every entry below the root, a folder with a reparse point as a link. An entry the walk finds
 * evicted stays; an evicted folder is listed before its read finds it so, and its removal skips it.
 */
async function listRemovalTargets(params: {
  rootPath: string;
  attributes: EntryAttributeAccess;
  entryReads: EntryReads;
  tally: StayedTally;
}): Promise<Result<RemovalTargets, string>> {
  const leaves: LeafTarget[] = [];
  const directories: DirectoryTarget[] = [];
  let failure: string | null = null;

  function visitEntry(entry: TreeEntry): TreeEntryVisit {
    switch (entry.kind) {
      case 'file':
      case 'other':
        leaves.push({ path: entry.path, kind: 'file' });

        return 'skip';
      case 'symbolicLink':
        leaves.push({ path: entry.path, kind: 'link' });

        return 'skip';
      case 'directory': {
        const attributes = params.attributes.load({ path: entry.path });

        if (attributes.kind === 'failed') {
          if (classifyEntryRemovalFailure({ code: attributes.failure }).kind === 'gone') {
            return 'skip';
          }

          failure ??= attributes.failure;

          return 'stop';
        }

        if (isReparsePoint({ attributes: attributes.value })) {
          leaves.push({ path: entry.path, kind: 'link' });

          return 'skip';
        }

        directories.push({ path: entry.path, depth: entry.depth });

        return 'descend';
      }
    }
  }

  await walkDirectoryTree({
    rootPath: params.rootPath,
    isStatsNeeded: true,
    maxConcurrentDirectories: MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => failure !== null,
    entryReads: params.entryReads,
    visitEntry: visitEntry,
    onUnreadable: (unreadable) => {
      failure ??= unreadable.failure.code;
    },
    onEvictedEntrySkipped: (entry) => {
      params.tally.recordStayed({ path: entry.path });
    },
  });

  if (failure !== null) {
    return { kind: 'failed', failure: failure };
  }

  return { kind: 'succeeded', value: { leaves: leaves, directories: directories } };
}

/** Removes the files and links; the first failure stops the removals not yet started. */
async function removeLeafTargets(params: {
  targets: LeafTarget[];
  attributes: EntryAttributeAccess;
  tally: StayedTally;
}): Promise<string | null> {
  let failure: string | null = null;

  await forEachConcurrently({
    items: params.targets,
    isStopped: () => failure !== null,
    task: async (target) => {
      const end = await removeLeafEntry({ target: target, attributes: params.attributes });

      switch (end.kind) {
        case 'gone':
          return;
        case 'stayed':
          params.tally.recordStayed({ path: target.path });

          return;
        case 'failed':
          failure ??= end.code;

          return;
      }
    },
  });

  return failure;
}

/**
 * Removes the folders from the deepest up, one depth at a time, the root last, unless it was
 * evicted; a failure stops the rest.
 */
async function removeDirectoryTargets(params: {
  directories: DirectoryTarget[];
  attributes: EntryAttributeAccess;
  tally: StayedTally;
}): Promise<string | null> {
  const directoriesByDepth = Map.groupBy(params.directories, (directory) => directory.depth);
  const depths = [...directoriesByDepth.keys()].sort((first, second) => second - first);
  let failure: string | null = null;

  for (const depth of depths) {
    await forEachConcurrently({
      items: directoriesByDepth.get(depth) ?? [],
      isStopped: () => failure !== null,
      task: async (directory) => {
        // An evicted folder, which its removal would delete from its cloud store.
        if (params.tally.isStayed({ path: directory.path })) {
          return;
        }

        const end = await removeDirectoryEntry({
          path: directory.path,
          attributes: params.attributes,
        });

        switch (end.kind) {
          case 'gone':
            return;
          case 'notEmpty':
            // A folder that holds no entry known to stay holds one the walk did not see.
            if (!params.tally.holdsStayed({ path: directory.path })) {
              params.tally.recordStayed({ path: directory.path });
            }

            return;
          case 'stayed':
            params.tally.recordStayed({ path: directory.path });

            return;
          case 'failed':
            failure ??= end.code;

            return;
        }
      },
    });

    if (failure !== null) {
      return failure;
    }
  }

  return null;
}

/**
 * Removes a file after clearing its read-only bit, or a link itself. A link to a folder is a
 * folder to Windows, which `unlink` refuses and `rmdir` removes without touching its target; a
 * folder with another reparse point that still holds entries stays.
 */
async function removeLeafEntry(params: {
  target: LeafTarget;
  attributes: EntryAttributeAccess;
}): Promise<EntryRemovalEnd> {
  switch (params.target.kind) {
    case 'file': {
      const cleared = clearReadOnly({ path: params.target.path, attributes: params.attributes });

      if (cleared.kind === 'failed') {
        return classifyEntryRemovalFailure({ code: cleared.failure });
      }

      return toEntryRemovalEnd(await runRemovalCall({ call: () => unlink(params.target.path) }));
    }
    case 'link':
      return removeLink({ path: params.target.path });
  }
}

async function removeLink(params: { path: string }): Promise<EntryRemovalEnd> {
  const unlinked = await runRemovalCall({ call: () => unlink(params.path) });

  if (
    unlinked.kind === 'succeeded' ||
    (unlinked.failure !== 'EPERM' && unlinked.failure !== 'EISDIR')
  ) {
    return toEntryRemovalEnd(unlinked);
  }

  const removed = await runRemovalCall({ call: () => rmdir(params.path) });

  if (removed.kind === 'succeeded') {
    return { kind: 'gone' };
  }

  // A link to a file, which `unlink` refused for its own reason.
  if (removed.failure === 'ENOTDIR') {
    return { kind: 'failed', code: unlinked.failure };
  }

  // A folder with another reparse point, such as a cloud store's, that holds entries of its own.
  if (removed.failure === 'ENOTEMPTY') {
    return { kind: 'stayed', code: removed.failure };
  }

  return classifyEntryRemovalFailure({ code: removed.failure });
}

async function removeDirectoryEntry(params: {
  path: string;
  attributes: EntryAttributeAccess;
}): Promise<DirectoryRemovalEnd> {
  const cleared = clearReadOnly({ path: params.path, attributes: params.attributes });

  if (cleared.kind === 'failed') {
    return classifyEntryRemovalFailure({ code: cleared.failure });
  }

  const removed = await runRemovalCall({ call: () => rmdir(params.path) });

  if (removed.kind === 'failed' && removed.failure === 'ENOTEMPTY') {
    return { kind: 'notEmpty' };
  }

  return toEntryRemovalEnd(removed);
}

/** Runs one removal call; a failure is its error code. */
async function runRemovalCall(params: {
  call: () => Promise<void>;
}): Promise<Result<null, string>> {
  try {
    await params.call();

    return { kind: 'succeeded', value: null };
  } catch (error) {
    return { kind: 'failed', failure: getErrorCode(error) };
  }
}

function toEntryRemovalEnd(removed: Result<null, string>): EntryRemovalEnd {
  if (removed.kind === 'succeeded') {
    return { kind: 'gone' };
  }

  return classifyEntryRemovalFailure({ code: removed.failure });
}

/** Clears the read-only bit of a file or a folder, never of a link, whose target it could reach. */
function clearReadOnly(params: {
  path: string;
  attributes: EntryAttributeAccess;
}): Result<null, string> {
  const attributes = params.attributes.load({ path: params.path });

  if (attributes.kind === 'failed') {
    return attributes;
  }

  if ((attributes.value & FILE_ATTRIBUTE_READONLY) === 0) {
    return { kind: 'succeeded', value: null };
  }

  return params.attributes.save({
    path: params.path,
    attributes: attributes.value & ~FILE_ATTRIBUTE_READONLY,
  });
}

function isReparsePoint(params: { attributes: number }): boolean {
  return (params.attributes & FILE_ATTRIBUTE_REPARSE_POINT) !== 0;
}

/** Counts the entries that stayed, and knows each folder that holds one of them. */
type StayedTally = {
  recordStayed: (params: { path: string }) => void;
  isStayed: (params: { path: string }) => boolean;
  holdsStayed: (params: { path: string }) => boolean;
  count: () => number;
};

function createStayedTally(params: { rootPath: string }): StayedTally {
  const stayedPaths = new Set<string>();
  const holderPaths = new Set<string>();

  function recordStayed(entry: { path: string }): void {
    stayedPaths.add(entry.path);

    if (entry.path === params.rootPath) {
      return;
    }

    let folderPath = dirname(entry.path);

    while (!holderPaths.has(folderPath)) {
      holderPaths.add(folderPath);

      const parentPath = dirname(folderPath);

      if (folderPath === params.rootPath || parentPath === folderPath) {
        return;
      }

      folderPath = parentPath;
    }
  }

  return {
    recordStayed: recordStayed,
    isStayed: (entry) => stayedPaths.has(entry.path),
    holdsStayed: (folder) => holderPaths.has(folder.path),
    count: () => stayedPaths.size,
  };
}

/** Runs `task` for each item, at most `MAX_CONCURRENT_REMOVALS` at once, until `isStopped`. */
async function forEachConcurrently<TItem>(params: {
  items: TItem[];
  isStopped: () => boolean;
  task: (item: TItem) => Promise<void>;
}): Promise<void> {
  let nextIndex = 0;

  async function work(): Promise<void> {
    while (!params.isStopped()) {
      const item = params.items[nextIndex];

      if (item === undefined) {
        return;
      }

      nextIndex += 1;
      await params.task(item);
    }
  }

  await Promise.all(Array.from({ length: MAX_CONCURRENT_REMOVALS }, () => work()));
}
