import type { BigIntStats } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { Result } from '../result.js';
import { getErrorCode } from './getErrorCode.js';
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

export type FileFailure = {
  reason: 'missing' | 'permissionDenied' | 'unexpected';
  code: string;
};

const MISSING_CODES = ['ENOENT', 'ENOTDIR'];

const PERMISSION_DENIED_CODES = ['EACCES', 'EPERM'];

export async function loadFileIdentity(params: {
  path: string;
}): Promise<Result<FileIdentity, FileFailure>> {
  try {
    const stats = await runFilesystemCall(() => lstat(params.path, { bigint: true }));
    const kind = getFileKind({ stats: stats });
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
  if (MISSING_CODES.includes(params.code)) {
    return { reason: 'missing', code: params.code };
  }

  if (PERMISSION_DENIED_CODES.includes(params.code)) {
    return { reason: 'permissionDenied', code: params.code };
  }

  return { reason: 'unexpected', code: params.code };
}
