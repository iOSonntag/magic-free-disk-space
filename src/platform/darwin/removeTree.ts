import type { Stats } from 'node:fs';
import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { lstat, open, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { TreeRemoval } from '../../delete/deletePlatform.js';
import type { Result } from '../../result.js';
import { getErrorCode } from '../../system/getErrorCode.js';

const OWNER_WRITE_MODE = 0o200;

const GROUP_WRITE_MODE = 0o020;

const OTHER_WRITE_MODE = 0o002;

const PERMISSION_MODE_MASK = 0o7777;

const SUPERUSER_ID = 0;

// The last part of the path is never followed, so a link in a folder's place fails the open.
const FOLDER_OPEN_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;

// Each folder of the walk holds a handle while it is visited; a wide tree, such as Go's module
// cache, would otherwise run out of them.
const MAX_CONCURRENT_FOLDERS = 16;

// The answers of the open for an entry that is no real folder: a link, a file, or a vanished one.
const noFolderErrorCodes = new Set(['ELOOP', 'ENOTDIR', 'ENOENT']);

/** The user who removes a tree: the folders of `id` may gain owner write, `groupIds` grant write. */
export type TreeRemovalUser = { id: number; groupIds: number[] };

/**
 * Removes the path recursively; a link inside goes itself, never its target. If that fails, it
 * adds owner write to each read-only folder the user owns that is no link, and retries once; a
 * still unremovable entry fails the removal, never `partlyRemoved`, and earlier entries stay gone.
 */
export async function removeTree(params: { path: string }): Promise<Result<TreeRemoval, string>> {
  return removeTreeAsUser({ path: params.path, user: getProcessUser() });
}

/**
 * `removeTree` for `user`, whose folders alone gain owner write; `null` where the platform has no
 * user ids, so no folder gains it. Fails with `EACCES` when a folder the user cannot write is left.
 */
export async function removeTreeAsUser(params: {
  path: string;
  user: TreeRemovalUser | null;
}): Promise<Result<TreeRemoval, string>> {
  const removed = await removePath({ path: params.path });

  if (removed.kind === 'succeeded' || params.user === null) {
    return removed;
  }

  const tally = await addOwnerWriteToTree({ rootPath: params.path, user: params.user });
  const retried = tally.changedCount === 0 ? removed : await removePath({ path: params.path });

  // The removal answers the last error it met, such as `ENOTEMPTY` for the parent of a folder it
  // could not empty; a folder the user cannot write is the cause.
  if (retried.kind === 'failed' && tally.deniedCount > 0) {
    return { kind: 'failed', failure: PERMISSION_DENIED_CODE };
  }

  return retried;
}

/** What a folder needs for the user to remove its entries. */
export type FolderWriteChange = 'addOwnerWrite' | 'none' | 'denied';

/**
 * Decides the change a folder needs for `user` to remove its entries: owner write for a folder of
 * the user that lacks it, and `denied` for a folder of another owner whose group and other bits
 * give the user no write.
 */
export function decideFolderWriteChange(params: {
  mode: number;
  ownerId: number;
  groupId: number;
  user: TreeRemovalUser;
}): FolderWriteChange {
  if (params.user.id === SUPERUSER_ID) {
    return 'none';
  }

  if (params.ownerId !== params.user.id) {
    const writableByOthers = (params.mode & OTHER_WRITE_MODE) !== 0;
    const writableByGroup =
      (params.mode & GROUP_WRITE_MODE) !== 0 && params.user.groupIds.includes(params.groupId);

    return writableByOthers || writableByGroup ? 'none' : 'denied';
  }

  return (params.mode & OWNER_WRITE_MODE) === 0 ? 'addOwnerWrite' : 'none';
}

/** The folders that gained owner write, and those the user cannot write that were left. */
type OwnerWriteTally = { changedCount: number; deniedCount: number };

const NO_CHANGE: OwnerWriteTally = { changedCount: 0, deniedCount: 0 };

const CHANGED: OwnerWriteTally = { changedCount: 1, deniedCount: 0 };

const DENIED: OwnerWriteTally = { changedCount: 0, deniedCount: 1 };

const PERMISSION_DENIED_CODE = 'EACCES';

function getProcessUser(): TreeRemovalUser | null {
  const id = process.getuid?.();

  if (id === undefined) {
    return null;
  }

  return { id: id, groupIds: process.getgroups?.() ?? [] };
}

async function removePath(params: { path: string }): Promise<Result<TreeRemoval, string>> {
  try {
    await rm(params.path, { recursive: true });

    return { kind: 'succeeded', value: { kind: 'removed' } };
  } catch (error) {
    return { kind: 'failed', failure: getErrorCode(error) };
  }
}

/** A folder of the walk's identity, which its children check their own open against. */
type VisitedFolder = { path: string; deviceId: number; inode: number };

/** A folder waiting in the walk, with the folder it was listed in; `null` for the root. */
type PendingFolder = { path: string; parent: VisitedFolder | null };

type FolderVisit = { tally: OwnerWriteTally; childFolders: PendingFolder[] };

/**
 * Adds owner write to the root folder and each folder below it that the user owns and lacks it,
 * visiting at most `MAX_CONCURRENT_FOLDERS` at once. A link, a file, or a folder reached through
 * an ancestor that turned into a link is left as it is and never listed.
 */
function addOwnerWriteToTree(params: {
  rootPath: string;
  user: TreeRemovalUser;
}): Promise<OwnerWriteTally> {
  const pendingFolders: PendingFolder[] = [{ path: params.rootPath, parent: null }];
  let activeCount = 0;
  let changedCount = 0;
  let deniedCount = 0;

  return new Promise((resolve, reject) => {
    function startVisits(): void {
      while (activeCount < MAX_CONCURRENT_FOLDERS && pendingFolders.length > 0) {
        const folder = pendingFolders.pop();

        if (folder === undefined) {
          break;
        }

        activeCount += 1;
        visitFolder({ folder: folder, user: params.user }).then(finishVisit, reject);
      }

      if (activeCount === 0) {
        resolve({ changedCount: changedCount, deniedCount: deniedCount });
      }
    }

    function finishVisit(visit: FolderVisit): void {
      activeCount -= 1;
      changedCount += visit.tally.changedCount;
      deniedCount += visit.tally.deniedCount;

      for (const childFolder of visit.childFolders) {
        pendingFolders.push(childFolder);
      }

      startVisits();
    }

    startVisits();
  });
}

/** The folder's tally and its child folders; a folder that does not open as itself has none. */
async function visitFolder(params: {
  folder: PendingFolder;
  user: TreeRemovalUser;
}): Promise<FolderVisit> {
  const opened = await openFolderHandle({ path: params.folder.path });

  if (opened.kind === 'failed') {
    return { tally: opened.failure === 'noFolder' ? NO_CHANGE : DENIED, childFolders: [] };
  }

  try {
    return await visitOpenFolder({
      folder: params.folder,
      handle: opened.value,
      user: params.user,
    });
  } finally {
    await opened.value.close();
  }
}

/** `noFolder` for a link, a file, or a vanished entry; `unopened` for any other failure. */
export type FolderOpenFailure = 'noFolder' | 'unopened';

async function openFolderHandle(params: {
  path: string;
}): Promise<Result<FileHandle, FolderOpenFailure>> {
  try {
    return { kind: 'succeeded', value: await open(params.path, FOLDER_OPEN_FLAGS) };
  } catch (error) {
    return { kind: 'failed', failure: errorToFolderOpenFailure(error) };
  }
}

function errorToFolderOpenFailure(error: unknown): FolderOpenFailure {
  return noFolderErrorCodes.has(getErrorCode(error)) ? 'noFolder' : 'unopened';
}

async function visitOpenFolder(params: {
  folder: PendingFolder;
  handle: FileHandle;
  user: TreeRemovalUser;
}): Promise<FolderVisit> {
  const stats = await loadHandleStats({ handle: params.handle });

  if (stats === null) {
    return { tally: DENIED, childFolders: [] };
  }

  // The open resolved the path anew, so an ancestor that turned into a link since its listing led
  // it to a folder outside the tree.
  if (params.folder.parent !== null && !(await isFolderAtPath({ folder: params.folder.parent }))) {
    return { tally: NO_CHANGE, childFolders: [] };
  }

  const change = decideFolderWriteChange({
    mode: stats.mode,
    ownerId: stats.uid,
    groupId: stats.gid,
    user: params.user,
  });
  const tally = await applyFolderWriteChange({
    handle: params.handle,
    mode: stats.mode,
    change: change,
  });
  const visited: VisitedFolder = {
    path: params.folder.path,
    deviceId: stats.dev,
    inode: stats.ino,
  };
  const childFolderNames = await loadChildFolderNames({ folderPath: params.folder.path });

  if (childFolderNames.kind === 'failed') {
    return {
      tally: childFolderNames.failure === 'noFolder' ? tally : addDeniedFolder(tally),
      childFolders: [],
    };
  }

  return {
    tally: tally,
    childFolders: childFolderNames.value.map((name) => ({
      path: join(params.folder.path, name),
      parent: visited,
    })),
  };
}

function addDeniedFolder(tally: OwnerWriteTally): OwnerWriteTally {
  return { changedCount: tally.changedCount, deniedCount: tally.deniedCount + 1 };
}

async function loadHandleStats(params: { handle: FileHandle }): Promise<Stats | null> {
  try {
    return await params.handle.stat();
  } catch {
    return null;
  }
}

/** Whether the folder's path still names that folder itself, not a link or another entry. */
async function isFolderAtPath(params: { folder: VisitedFolder }): Promise<boolean> {
  try {
    const stats = await lstat(params.folder.path);

    return (
      stats.isDirectory() &&
      stats.dev === params.folder.deviceId &&
      stats.ino === params.folder.inode
    );
  } catch {
    return false;
  }
}

async function applyFolderWriteChange(params: {
  handle: FileHandle;
  mode: number;
  change: FolderWriteChange;
}): Promise<OwnerWriteTally> {
  switch (params.change) {
    case 'none':
      return NO_CHANGE;
    case 'denied':
      return DENIED;
    case 'addOwnerWrite':
      try {
        await params.handle.chmod((params.mode & PERMISSION_MODE_MASK) | OWNER_WRITE_MODE);

        return CHANGED;
      } catch {
        return DENIED;
      }
  }
}

/**
 * The names of the real folders directly inside. Fails as `noFolder` when the path no longer names
 * a folder, and as `unopened` when it cannot be listed, as the open of a folder does.
 */
export async function loadChildFolderNames(params: {
  folderPath: string;
}): Promise<Result<string[], FolderOpenFailure>> {
  try {
    const entries = await readdir(params.folderPath, { withFileTypes: true });

    return {
      kind: 'succeeded',
      value: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    };
  } catch (error) {
    return { kind: 'failed', failure: errorToFolderOpenFailure(error) };
  }
}
