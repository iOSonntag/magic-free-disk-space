import { rmdir, unlink } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { TreeRemoval } from '../../delete/deletePlatform.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import { createConcurrencyLimit } from '../../system/createConcurrencyLimit.js';
import type { EntryReads } from '../../system/entryReads.js';
import { getPlacedFileKind } from '../../system/entryReads.js';
import {
  getErrorCode,
  isInUseErrorCode,
  isPermissionDeniedErrorCode,
} from '../../system/getErrorCode.js';
import { loadEntryStats } from '../../system/loadEntryStats.js';
import type { TreeEntry, TreeEntryVisit } from '../../system/walkDirectoryTree.js';
import { walkDirectoryTree } from '../../system/walkDirectoryTree.js';

/** The entry cannot be deleted until this bit is cleared. */
const FILE_ATTRIBUTE_READONLY = 0x1;

const MAX_CONCURRENT_DIRECTORIES = 16;

const MAX_CONCURRENT_REMOVALS = 16;

/** The codes of an entry that is gone already, or whose folder is. */
const GONE_CODES = ['ENOENT', 'ENOTDIR'];

const runLimitedRemoval = createConcurrencyLimit({ maxConcurrent: MAX_CONCURRENT_REMOVALS });

/**
 * Reads and sets the `FILE_ATTRIBUTE_*` bits of an entry, never following a link. A failure is the
 * error code of the call, `ENOENT` for an entry that is gone.
 */
export type EntryAttributeAccess = {
  load: (params: { path: AbsolutePath }) => Result<number, string>;
  save: (params: { path: AbsolutePath; attributes: number }) => Result<null, string>;
};

/** How the removal of one entry ended; one that stayed or failed carries the code of its call. */
export type EntryRemovalEnd =
  | { kind: 'gone' }
  | { kind: 'stayed'; code: string }
  | { kind: 'failed'; code: string };

/** The kind of entry a removal call went to: a file, a link of any kind, or a folder. */
export type RemovalEntryKind = 'file' | 'link' | 'directory';

/** A file, or a link of any kind, which goes as one entry. */
type LeafTarget = { path: AbsolutePath; kind: 'file' | 'link' };

type DirectoryTarget = { path: AbsolutePath; depth: number };

type RemovalTargets = { leaves: LeafTarget[]; directories: DirectoryTarget[] };

/** A folder's removal ends as an entry's does, or finds it still holds entries. */
type DirectoryRemovalEnd = EntryRemovalEnd | { kind: 'notEmpty' };

/**
 * Removes the tree at `rootPath` entry by entry, as Windows needs it: `entryReads` places each
 * entry, the root included, and the walk never enters a link of any kind, which is removed
 * itself, never its target. Each file and folder loses its read-only bit right before its
 * removal. A file another program holds open or Windows refuses to delete stays, and so does an
 * entry kept online only, the root included, which a removal would delete from its cloud store;
 * the folders that hold them stay with them. Any other failure ends the removal with its code; an
 * unreadable folder, or a root or a folder that cannot be placed, ends it before anything is
 * removed. Never throws.
 */
export async function removeTreeEntries(params: {
  rootPath: AbsolutePath;
  rules: PathRules;
  attributes: EntryAttributeAccess;
  entryReads: EntryReads;
}): Promise<Result<TreeRemoval, string>> {
  const rootStats = await loadEntryStats({ path: params.rootPath });

  if (rootStats.kind === 'failed') {
    return { kind: 'failed', failure: rootStats.failure.code };
  }

  const rootPlacement = params.entryReads.loadEntryPlacement({
    path: params.rootPath,
    kind: rootStats.value.kind,
  });

  switch (rootPlacement.kind) {
    case 'cloudOnly':
      return { kind: 'succeeded', value: { kind: 'partlyRemoved', stayedEntryCount: 1 } };
    // Entering it could reach another volume mounted there, or recall a placeholder.
    case 'unread':
      return { kind: 'failed', failure: rootPlacement.code };
    case 'onDisk':
    case 'link':
      break;
  }

  switch (getPlacedFileKind({ kind: rootStats.value.kind, placement: rootPlacement })) {
    case 'file':
    case 'other':
      return removeRootLeaf({
        target: { path: params.rootPath, kind: 'file' },
        attributes: params.attributes,
      });
    case 'symbolicLink':
      return removeRootLeaf({
        target: { path: params.rootPath, kind: 'link' },
        attributes: params.attributes,
      });
    case 'directory':
      return removeDirectoryTree({
        rootPath: params.rootPath,
        rules: params.rules,
        attributes: params.attributes,
        entryReads: params.entryReads,
      });
  }
}

/**
 * How a failed removal call of one entry ends: gone already; stayed when another program holds
 * it open, or when Windows refuses a file, such as a program that runs; else failed.
 */
export function decideEntryRemovalEnd(params: {
  code: string;
  entryKind: RemovalEntryKind;
}): EntryRemovalEnd {
  if (GONE_CODES.includes(params.code)) {
    return { kind: 'gone' };
  }

  if (isInUseErrorCode(params.code)) {
    return { kind: 'stayed', code: params.code };
  }

  switch (params.entryKind) {
    case 'file':
      if (isPermissionDeniedErrorCode(params.code)) {
        return { kind: 'stayed', code: params.code };
      }

      return { kind: 'failed', code: params.code };
    case 'link':
    case 'directory':
      return { kind: 'failed', code: params.code };
  }
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
  rootPath: AbsolutePath;
  rules: PathRules;
  attributes: EntryAttributeAccess;
  entryReads: EntryReads;
}): Promise<Result<TreeRemoval, string>> {
  const tally = createStayedTally({ rootPath: params.rootPath });
  const listing = await listRemovalTargets({
    rootPath: params.rootPath,
    rules: params.rules,
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
 * Every entry below the root, as the walk places it, a link of any kind as a link. An entry the
 * walk finds evicted stays; an evicted folder is listed before the walk records it so, and its
 * removal skips it. A folder that cannot be placed ends the listing with the code of its read,
 * unless it is gone. A file that cannot be placed is listed as any other: the clear of its
 * read-only bit reads its attributes again, and a failure there ends its removal by its code.
 */
async function listRemovalTargets(params: {
  rootPath: AbsolutePath;
  rules: PathRules;
  entryReads: EntryReads;
  tally: StayedTally;
}): Promise<Result<RemovalTargets, string>> {
  const leaves: LeafTarget[] = [];
  const directories: DirectoryTarget[] = [];
  // The folders the walk enters, by the path it names them with, so each entry's path is derived
  // from its folder's.
  const directoryPaths = new Map<string, AbsolutePath>([[params.rootPath, params.rootPath]]);
  let failure: string | null = null;

  function getEntryPath(entry: { path: string }): AbsolutePath {
    const directoryPath = directoryPaths.get(entry.path);

    if (directoryPath !== undefined) {
      return directoryPath;
    }

    const parentPath = directoryPaths.get(dirname(entry.path));

    if (parentPath === undefined) {
      throw new Error('The walk named an entry outside the folders it entered.');
    }

    return joinAbsolutePath({
      rules: params.rules,
      parentPath: parentPath,
      names: [basename(entry.path)],
    });
  }

  function visitEntry(entry: TreeEntry): TreeEntryVisit {
    const entryPath = getEntryPath(entry);

    switch (entry.kind) {
      case 'file':
      case 'other':
        leaves.push({ path: entryPath, kind: 'file' });

        return 'skip';
      case 'symbolicLink':
        leaves.push({ path: entryPath, kind: 'link' });

        return 'skip';
      case 'directory':
        if (entry.placementFailureCode !== null) {
          return refuseUnplacedDirectory(entry.placementFailureCode);
        }

        directoryPaths.set(entry.path, entryPath);
        directories.push({ path: entryPath, depth: entry.depth });

        return 'descend';
    }
  }

  // Entering it could reach another volume mounted there, or recall a placeholder.
  function refuseUnplacedDirectory(code: string): TreeEntryVisit {
    switch (decideEntryRemovalEnd({ code: code, entryKind: 'directory' }).kind) {
      case 'gone':
        return 'skip';
      case 'stayed':
      case 'failed':
        failure ??= code;

        return 'stop';
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
      params.tally.recordStayed({ path: getEntryPath(entry) });
    },
  });

  if (failure !== null) {
    return { kind: 'failed', failure: failure };
  }

  return { kind: 'succeeded', value: { leaves: leaves, directories: directories } };
}

/** Removes the files and links; after the first failure no further removal starts. */
async function removeLeafTargets(params: {
  targets: LeafTarget[];
  attributes: EntryAttributeAccess;
  tally: StayedTally;
}): Promise<string | null> {
  let failure: string | null = null;

  async function removeTarget(target: LeafTarget): Promise<void> {
    if (failure !== null) {
      return;
    }

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
  }

  await Promise.all(params.targets.map((target) => runLimitedRemoval(() => removeTarget(target))));

  return failure;
}

/**
 * Removes the folders from the deepest up, one depth at a time, the root last, unless it was
 * evicted; after the first failure no further removal starts.
 */
async function removeDirectoryTargets(params: {
  directories: DirectoryTarget[];
  attributes: EntryAttributeAccess;
  tally: StayedTally;
}): Promise<string | null> {
  const directoriesByDepth = Map.groupBy(params.directories, (directory) => directory.depth);
  const depths = [...directoriesByDepth.keys()].sort((first, second) => second - first);
  let failure: string | null = null;

  async function removeTarget(directory: DirectoryTarget): Promise<void> {
    if (failure !== null) {
      return;
    }

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
  }

  for (const depth of depths) {
    const directoriesAtDepth = directoriesByDepth.get(depth) ?? [];

    await Promise.all(
      directoriesAtDepth.map((directory) => runLimitedRemoval(() => removeTarget(directory))),
    );

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
        return decideEntryRemovalEnd({ code: cleared.failure, entryKind: 'file' });
      }

      const removed = await runRemovalCall({ call: () => unlink(params.target.path) });

      return toEntryRemovalEnd({ removed: removed, entryKind: 'file' });
    }
    case 'link':
      return removeLink({ path: params.target.path });
  }
}

async function removeLink(params: { path: AbsolutePath }): Promise<EntryRemovalEnd> {
  const unlinked = await runRemovalCall({ call: () => unlink(params.path) });

  if (
    unlinked.kind === 'succeeded' ||
    (unlinked.failure !== 'EPERM' && unlinked.failure !== 'EISDIR')
  ) {
    return toEntryRemovalEnd({ removed: unlinked, entryKind: 'link' });
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

  return decideEntryRemovalEnd({ code: removed.failure, entryKind: 'link' });
}

async function removeDirectoryEntry(params: {
  path: AbsolutePath;
  attributes: EntryAttributeAccess;
}): Promise<DirectoryRemovalEnd> {
  const cleared = clearReadOnly({ path: params.path, attributes: params.attributes });

  if (cleared.kind === 'failed') {
    return decideEntryRemovalEnd({ code: cleared.failure, entryKind: 'directory' });
  }

  const removed = await runRemovalCall({ call: () => rmdir(params.path) });

  if (removed.kind === 'failed' && removed.failure === 'ENOTEMPTY') {
    return { kind: 'notEmpty' };
  }

  return toEntryRemovalEnd({ removed: removed, entryKind: 'directory' });
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

function toEntryRemovalEnd(params: {
  removed: Result<null, string>;
  entryKind: RemovalEntryKind;
}): EntryRemovalEnd {
  if (params.removed.kind === 'succeeded') {
    return { kind: 'gone' };
  }

  return decideEntryRemovalEnd({ code: params.removed.failure, entryKind: params.entryKind });
}

/** Clears the read-only bit of a file or a folder, never of a link, whose target it could reach. */
function clearReadOnly(params: {
  path: AbsolutePath;
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

/** Counts the entries that stayed, and knows each folder that holds one of them. */
type StayedTally = {
  recordStayed: (params: { path: AbsolutePath }) => void;
  isStayed: (params: { path: AbsolutePath }) => boolean;
  holdsStayed: (params: { path: AbsolutePath }) => boolean;
  count: () => number;
};

function createStayedTally(params: { rootPath: AbsolutePath }): StayedTally {
  const stayedPaths = new Set<string>();
  const holderPaths = new Set<string>();

  function recordStayed(entry: { path: AbsolutePath }): void {
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
