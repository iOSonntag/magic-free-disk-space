import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Result } from '../result.js';
import type { ToolFileStats } from './decideToolTrust.js';
import { decideToolTrust } from './decideToolTrust.js';
import { loadFlutterSdkDartPaths } from './loadFlutterSdkDartPaths.js';
import type { ToolLocation, ToolLocationPath, ToolName } from './toolInstallLocations.js';

/** A binary that passed the trust check; `path` is its real path. */
export type LocatedTool = { name: ToolName; path: string };

export type ToolLookupFailureNotFound = { reason: 'notFound' };

export type ToolLookupFailureUntrusted = {
  reason: 'untrusted';
  path: string;
  detail: 'foreignOwner' | 'writableByOthers' | 'notExecutableFile';
};

export type ToolLookupFailure = ToolLookupFailureNotFound | ToolLookupFailureUntrusted;

/**
 * Returns the first location whose binary is a regular executable file owned by `userId` or
 * root and writable by neither group nor others. Without one, it fails as `untrusted` for the
 * first binary that exists, else as `notFound`.
 */
export async function findTrustedTool(params: {
  name: ToolName;
  locations: ToolLocation[];
  homeDir: string;
  userId: number;
}): Promise<Result<LocatedTool, ToolLookupFailure>> {
  let firstUntrusted: ToolLookupFailureUntrusted | null = null;

  for (const location of params.locations) {
    const paths = await loadLocationPaths({ location: location, homeDir: params.homeDir });

    for (const path of paths) {
      const checked = await loadTrustedTool({
        name: params.name,
        path: path,
        userId: params.userId,
      });

      if (checked.kind === 'succeeded') {
        return checked;
      }

      if (checked.failure.reason === 'untrusted' && firstUntrusted === null) {
        firstUntrusted = checked.failure;
      }
    }
  }

  return { kind: 'failed', failure: firstUntrusted ?? { reason: 'notFound' } };
}

/**
 * Checks the binary at `path` again, as `findTrustedTool` checks each location. A symbolic link
 * is followed; the real path is what is checked, returned, and named in an `untrusted` failure.
 */
export async function loadTrustedTool(params: {
  name: ToolName;
  path: string;
  userId: number;
}): Promise<Result<LocatedTool, ToolLookupFailure>> {
  const realPath = await loadRealPath({ path: params.path });

  if (realPath === null) {
    return { kind: 'failed', failure: { reason: 'notFound' } };
  }

  const stats = await loadToolFileStats({ path: realPath });

  if (stats === null) {
    return { kind: 'failed', failure: { reason: 'notFound' } };
  }

  const trust = decideToolTrust({ stats: stats, userId: params.userId });

  if (!trust.isTrusted) {
    return {
      kind: 'failed',
      failure: { reason: 'untrusted', path: realPath, detail: trust.detail },
    };
  }

  return { kind: 'succeeded', value: { name: params.name, path: realPath } };
}

async function loadLocationPaths(params: {
  location: ToolLocation;
  homeDir: string;
}): Promise<string[]> {
  switch (params.location.kind) {
    case 'path':
      return [buildFixedLocationPath({ location: params.location, homeDir: params.homeDir })];
    case 'flutterSdkFromActiveRoots':
      return loadFlutterSdkDartPaths({ homeDir: params.homeDir });
  }
}

function buildFixedLocationPath(params: { location: ToolLocationPath; homeDir: string }): string {
  switch (params.location.root) {
    case 'absolute':
      return params.location.path;
    case 'home':
      return join(params.homeDir, params.location.path);
  }
}

/** `null` when nothing is there, a link dangles, or the path cannot be read. */
async function loadRealPath(params: { path: string }): Promise<string | null> {
  try {
    return await realpath(params.path);
  } catch {
    return null;
  }
}

/** Reads the real path itself, so a link swapped in after `realpath` is judged as a link. */
async function loadToolFileStats(params: { path: string }): Promise<ToolFileStats | null> {
  try {
    const stats = await lstat(params.path);

    return { isRegularFile: stats.isFile(), mode: stats.mode, ownerUserId: stats.uid };
  } catch {
    return null;
  }
}
