import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import type { Result } from '../result.js';
import { getErrorCode } from './getErrorCode.js';
import type { DirectoryFailure } from './loadDirectoryNames.js';
import { getDirectoryFailure } from './loadDirectoryNames.js';
import type { FileKind } from './loadFileIdentity.js';
import { runFilesystemCall } from './runFilesystemCall.js';

export type DirectoryEntry = { name: string; kind: FileKind };

/**
 * Lists a directory with the kind of each entry, sorted by name, without a stat call per entry.
 * A symbolic link is reported as a link, never as what it points to.
 */
export async function loadDirectoryEntries(params: {
  path: string;
}): Promise<Result<DirectoryEntry[], DirectoryFailure>> {
  try {
    const dirents = await runFilesystemCall(() => readdir(params.path, { withFileTypes: true }));
    const entries = dirents.map((dirent) => ({
      name: dirent.name,
      kind: getDirentKind({ dirent: dirent }),
    }));

    return {
      kind: 'succeeded',
      value: entries.toSorted((left, right) => (left.name < right.name ? -1 : 1)),
    };
  } catch (error) {
    return { kind: 'failed', failure: getDirectoryFailure({ code: getErrorCode(error) }) };
  }
}

function getDirentKind(params: { dirent: Dirent }): FileKind {
  if (params.dirent.isSymbolicLink()) {
    return 'symbolicLink';
  }

  if (params.dirent.isDirectory()) {
    return 'directory';
  }

  if (params.dirent.isFile()) {
    return 'file';
  }

  return 'other';
}
