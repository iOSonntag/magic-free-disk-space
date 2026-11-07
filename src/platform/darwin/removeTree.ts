import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { open, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Result } from '../../result.js';
import { getErrorCode } from '../../system/getErrorCode.js';

const OWNER_WRITE_MODE = 0o200;

const PERMISSION_MODE_MASK = 0o7777;

// No link is followed: a link that took a folder's place since its listing fails the open.
const FOLDER_OPEN_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;

/**
 * Removes the path recursively; a symbolic link inside is removed itself, never its target. When
 * that fails, it adds owner write to each read-only folder inside that the user owns and that is
 * no link, such as those of Go's module cache, and tries once more.
 */
export async function removeTree(params: { path: string }): Promise<Result<null, string>> {
  return removeTreeAsUser({ path: params.path, userId: process.getuid?.() ?? null });
}

/**
 * `removeTree` for the user of `userId`, whose folders alone gain owner write; `null` where the
 * platform has no user ids, so no folder gains it.
 */
export async function removeTreeAsUser(params: {
  path: string;
  userId: number | null;
}): Promise<Result<null, string>> {
  const removed = await removePath({ path: params.path });

  if (removed.kind === 'succeeded' || params.userId === null) {
    return removed;
  }

  const tally = await addOwnerWriteToFolders({ folderPath: params.path, userId: params.userId });
  const retried = tally.changedCount === 0 ? removed : await removePath({ path: params.path });

  // The removal answers the last error it met, such as `ENOTEMPTY` for the parent of a folder it
  // could not empty; a read-only folder left as it is is the cause.
  if (retried.kind === 'failed' && tally.deniedCount > 0) {
    return { kind: 'failed', failure: PERMISSION_DENIED_CODE };
  }

  return retried;
}

/** The folders that gained owner write, and the read-only ones left without it. */
type OwnerWriteTally = { changedCount: number; deniedCount: number };

const PERMISSION_DENIED_CODE = 'EACCES';

async function removePath(params: { path: string }): Promise<Result<null, string>> {
  try {
    await rm(params.path, { recursive: true });

    return { kind: 'succeeded', value: null };
  } catch (error) {
    return { kind: 'failed', failure: getErrorCode(error) };
  }
}

/**
 * Adds owner write to the folder and each folder below it that the user owns and lacks it. A
 * link, a file, a folder of another owner, or a failed read or change is left as it is, for the
 * removal to report.
 */
async function addOwnerWriteToFolders(params: {
  folderPath: string;
  userId: number;
}): Promise<OwnerWriteTally> {
  const own = await addOwnerWriteToFolder(params);
  const childFolderNames = await loadChildFolderNames({ folderPath: params.folderPath });
  const childTallies = await Promise.all(
    childFolderNames.map((name) =>
      addOwnerWriteToFolders({ folderPath: join(params.folderPath, name), userId: params.userId }),
    ),
  );

  return childTallies.reduce(
    (total, tally) => ({
      changedCount: total.changedCount + tally.changedCount,
      deniedCount: total.deniedCount + tally.deniedCount,
    }),
    own,
  );
}

const NO_CHANGE: OwnerWriteTally = { changedCount: 0, deniedCount: 0 };

/** The folder's own tally: changed, left read-only, or neither; a link or a file is neither. */
async function addOwnerWriteToFolder(params: {
  folderPath: string;
  userId: number;
}): Promise<OwnerWriteTally> {
  let handle: FileHandle;

  try {
    handle = await open(params.folderPath, FOLDER_OPEN_FLAGS);
  } catch {
    return NO_CHANGE;
  }

  try {
    const stats = await handle.stat();

    if ((stats.mode & OWNER_WRITE_MODE) !== 0) {
      return NO_CHANGE;
    }

    if (stats.uid !== params.userId) {
      return { changedCount: 0, deniedCount: 1 };
    }

    await handle.chmod((stats.mode & PERMISSION_MODE_MASK) | OWNER_WRITE_MODE);

    return { changedCount: 1, deniedCount: 0 };
  } catch {
    return { changedCount: 0, deniedCount: 1 };
  } finally {
    await handle.close();
  }
}

/** The names of the real folders directly inside; none when it cannot be listed. */
async function loadChildFolderNames(params: { folderPath: string }): Promise<string[]> {
  try {
    const entries = await readdir(params.folderPath, { withFileTypes: true });

    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}
