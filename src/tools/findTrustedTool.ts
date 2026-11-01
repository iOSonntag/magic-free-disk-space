import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Result } from '../result.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import { loadFileText } from '../system/loadFileText.js';
import { loadRealPath } from '../system/loadRealPath.js';
import { decideDartBinaryPath, listFlutterWrapperPaths } from './decideDartBinaryPath.js';
import type { ToolDistrustDetail, ToolFileStats } from './decideToolTrust.js';
import { decideToolTrust } from './decideToolTrust.js';
import { isDartVersionSupported } from './isDartVersionSupported.js';
import { TOOL_FILE_MAX_BYTES } from './limits.js';
import { loadFlutterSdkDartPaths } from './loadFlutterSdkDartPaths.js';
import type { ToolLocation, ToolLocationPath, ToolName } from './toolInstallLocations.js';

/** A binary that passed the trust check and, for `dart`, the version check; `path` is its real path. */
export type LocatedTool = { name: ToolName; path: string };

export type ToolLookupFailureNotFound = { reason: 'notFound' };

export type ToolLookupFailureUntrusted = {
  reason: 'untrusted';
  path: string;
  detail: ToolDistrustDetail;
};

export type ToolLookupFailure = ToolLookupFailureNotFound | ToolLookupFailureUntrusted;

/**
 * Returns the first location whose binary `loadTrustedTool` accepts. Without one, it fails as
 * `untrusted` for the first binary that failed the trust check, else as `notFound`.
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
 * Accepts the binary at `path` when it is a regular executable file owned by `userId` or root and
 * writable by neither group nor others, and for `dart`, of an SDK of 3.11 or later; a trusted
 * binary that fails the version check fails as `notFound`. A symbolic link is followed; the real
 * path is what is checked, returned, and named in an `untrusted` failure. For `dart`, Flutter's
 * `bin/dart` wrapper stands for its SDK's binary, as `decideDartBinaryPath` decides.
 */
export async function loadTrustedTool(params: {
  name: ToolName;
  path: string;
  userId: number;
}): Promise<Result<LocatedTool, ToolLookupFailure>> {
  const binaryPath = await loadToolBinaryPath({ name: params.name, path: params.path });

  if (binaryPath === null) {
    return { kind: 'failed', failure: { reason: 'notFound' } };
  }

  const stats = await loadToolFileStats({ path: binaryPath });

  if (stats === null) {
    return { kind: 'failed', failure: { reason: 'notFound' } };
  }

  const trust = decideToolTrust({ stats: stats, userId: params.userId });

  if (!trust.isTrusted) {
    return {
      kind: 'failed',
      failure: { reason: 'untrusted', path: binaryPath, detail: trust.detail },
    };
  }

  const tool: LocatedTool = { name: params.name, path: binaryPath };
  const accepted = await isLocatedToolAccepted({ tool: tool });

  if (!accepted) {
    return { kind: 'failed', failure: { reason: 'notFound' } };
  }

  return { kind: 'succeeded', value: tool };
}

/** Whether a trusted binary can run the commands of its tool; only `dart` has a version rule. */
async function isLocatedToolAccepted(params: { tool: LocatedTool }): Promise<boolean> {
  switch (params.tool.name) {
    case 'dart':
      return isDartSdkSupported({ binaryPath: params.tool.path });
    case 'xcrun':
    case 'mise':
    case 'brewAppleSilicon':
    case 'brewIntel':
    case 'avdmanager':
    case 'asdf':
      return true;
  }
}

/**
 * Reads the version file beside the `bin` folder of the binary's real path, which both a Flutter
 * SDK's `dart-sdk` and Homebrew's `libexec` hold; `false` when it is missing or unreadable.
 */
async function isDartSdkSupported(params: { binaryPath: string }): Promise<boolean> {
  const versionText = await loadFileText({
    path: join(dirname(dirname(params.binaryPath)), 'version'),
    maxBytes: TOOL_FILE_MAX_BYTES,
  });

  if (versionText.kind === 'failed') {
    return false;
  }

  return isDartVersionSupported(versionText.value);
}

/** The real path of the binary that the location at `path` stands for; `null` for none. */
async function loadToolBinaryPath(params: {
  name: ToolName;
  path: string;
}): Promise<string | null> {
  const realPath = await loadRealPath({ path: params.path });

  if (realPath === null) {
    return null;
  }

  switch (params.name) {
    case 'dart':
      return loadDartBinaryPath({ realPath: realPath });
    case 'xcrun':
    case 'mise':
    case 'brewAppleSilicon':
    case 'brewIntel':
    case 'avdmanager':
    case 'asdf':
      return realPath;
  }
}

/** The SDK's binary in place of Flutter's wrapper, resolved once more, since it may be a link. */
async function loadDartBinaryPath(params: { realPath: string }): Promise<string | null> {
  const presentPaths = await loadPresentPaths({
    paths: listFlutterWrapperPaths({ realPath: params.realPath }),
  });
  const binaryPath = decideDartBinaryPath({
    realPath: params.realPath,
    presentPaths: presentPaths,
  });

  if (binaryPath === null || binaryPath === params.realPath) {
    return binaryPath;
  }

  return loadRealPath({ path: binaryPath });
}

/** The given paths that something is at, a dangling link included. */
async function loadPresentPaths(params: { paths: string[] }): Promise<string[]> {
  const presence = await Promise.all(
    params.paths.map(async (path) => {
      const entryStats = await loadEntryStats({ path: path });

      return entryStats.kind === 'succeeded';
    }),
  );

  return params.paths.filter((_, index) => presence[index]);
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

/** Reads the real path itself, so a link swapped in after `realpath` is judged as a link. */
async function loadToolFileStats(params: { path: string }): Promise<ToolFileStats | null> {
  try {
    const stats = await lstat(params.path);

    return { isRegularFile: stats.isFile(), mode: stats.mode, ownerUserId: stats.uid };
  } catch {
    return null;
  }
}
