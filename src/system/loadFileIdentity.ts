import type { BigIntStats } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { Result } from '../result.js';
import {
  getErrorCode,
  isInUseErrorCode,
  isMissingErrorCode,
  isPermissionDeniedErrorCode,
} from './getErrorCode.js';
import { runFilesystemCall } from './runFilesystemCall.js';

export type FileKind = 'file' | 'directory' | 'symbolicLink' | 'other';

export type FileIdentity = {
  dev: bigint;
  ino: bigint;
  /** Tells apart a file that took the inode number of a deleted one, where a disk reuses them. */
  birthtimeNs: bigint;
  kind: FileKind;
  /** The resolved path; for a link, socket, or pipe, its resolved folder with its own name. */
  realPath: string;
};

/**
 * `inUse`: another program holds the file open without sharing it, such as Windows' page file,
 * which only Windows refuses a read for.
 */
export type FileFailure = {
  reason: 'missing' | 'permissionDenied' | 'inUse' | 'unexpected';
  code: string;
};

export function loadFileIdentity(params: {
  path: string;
}): Promise<Result<FileIdentity, FileFailure>> {
  return loadFileIdentityOfKind({ path: params.path, decideKind: (lstatKind) => lstatKind });
}

/**
 * `loadFileIdentity`, of the kind `decideKind` makes of lstat's; the real path follows that kind.
 */
export async function loadFileIdentityOfKind(params: {
  path: string;
  decideKind: (lstatKind: FileKind) => FileKind;
}): Promise<Result<FileIdentity, FileFailure>> {
  try {
    const stats = await runFilesystemCall(() => lstat(params.path, { bigint: true }));
    const kind = params.decideKind(getFileKind({ stats: stats }));
    // A file or folder resolves fully, which also takes the case on disk. A link keeps its own
    // name, and a socket or pipe resolves through its folder: realpath fails on one (EOPNOTSUPP).
    const realPath =
      kind === 'file' || kind === 'directory'
        ? await runFilesystemCall(() => realpath(params.path))
        : join(
            await runFilesystemCall(() => realpath(dirname(params.path))),
            basename(params.path),
          );

    return {
      kind: 'succeeded',
      value: {
        dev: stats.dev,
        ino: stats.ino,
        birthtimeNs: stats.birthtimeNs,
        kind: kind,
        realPath: realPath,
      },
    };
  } catch (error) {
    return { kind: 'failed', failure: getFileFailure({ code: getErrorCode(error) }) };
  }
}

export function getFileKind(params: { stats: BigIntStats }): FileKind {
  if (params.stats.isSymbolicLink()) {
    return 'symbolicLink';
  }

  if (params.stats.isDirectory()) {
    return 'directory';
  }

  if (params.stats.isFile()) {
    return 'file';
  }

  return 'other';
}

export function getFileFailure(params: { code: string }): FileFailure {
  if (isMissingErrorCode(params.code)) {
    return { reason: 'missing', code: params.code };
  }

  if (isPermissionDeniedErrorCode(params.code)) {
    return { reason: 'permissionDenied', code: params.code };
  }

  if (isInUseErrorCode(params.code)) {
    return { reason: 'inUse', code: params.code };
  }

  return { reason: 'unexpected', code: params.code };
}
