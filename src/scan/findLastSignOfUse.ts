import { join } from 'node:path';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadEntryStats } from '../system/loadEntryStats.js';

const MAX_CHILDREN_PER_DIRECTORY = 200;

/**
 * Returns the newest modification time in ms among the places an app writes when it is used, or
 * `null` when none could be read. Never throws: an unreadable place is skipped.
 */
export async function findLastSignOfUse(params: {
  homeDir: string;
  bundleId: string | null;
  displayName: string;
}): Promise<number | null> {
  const signPaths = buildSignOfUsePaths({
    homeDir: params.homeDir,
    bundleId: params.bundleId,
    displayName: params.displayName,
  });
  const modifiedTimesPerPath = await Promise.all(
    signPaths.map((signPath) => loadModifiedTimesOfPathAndChildren({ path: signPath })),
  );
  const modifiedTimes = modifiedTimesPerPath.flat();

  if (modifiedTimes.length === 0) {
    return null;
  }

  return Math.max(...modifiedTimes);
}

/**
 * The places an app writes when it runs: in the Library of the home folder and, for a
 * sandboxed app, in the Library inside its container, where macOS redirects those writes.
 */
export function buildSignOfUsePaths(params: {
  homeDir: string;
  bundleId: string | null;
  displayName: string;
}): string[] {
  const libraryDir = join(params.homeDir, 'Library');
  const displayNamePath = join(libraryDir, 'Application Support', params.displayName);

  if (params.bundleId === null) {
    return [displayNamePath];
  }

  const containerPath = join(libraryDir, 'Containers', params.bundleId);

  return [
    ...buildLibrarySignOfUsePaths({
      libraryDir: libraryDir,
      bundleId: params.bundleId,
      displayName: params.displayName,
    }),
    containerPath,
    ...buildLibrarySignOfUsePaths({
      libraryDir: join(containerPath, 'Data/Library'),
      bundleId: params.bundleId,
      displayName: params.displayName,
    }),
  ];
}

function buildLibrarySignOfUsePaths(params: {
  libraryDir: string;
  bundleId: string;
  displayName: string;
}): string[] {
  return [
    join(params.libraryDir, 'Preferences', `${params.bundleId}.plist`),
    join(params.libraryDir, 'Saved Application State', `${params.bundleId}.savedState`),
    join(params.libraryDir, 'Caches', params.bundleId),
    join(params.libraryDir, 'Application Support', params.bundleId),
    join(params.libraryDir, 'Application Support', params.displayName),
  ];
}

async function loadModifiedTimesOfPathAndChildren(params: { path: string }): Promise<number[]> {
  const statsResult = await loadEntryStats({ path: params.path });

  if (statsResult.kind === 'failed') {
    return [];
  }

  if (statsResult.value.kind !== 'directory') {
    return [statsResult.value.modifiedMs];
  }

  const childModifiedTimes = await loadChildModifiedTimes({ directoryPath: params.path });

  return [statsResult.value.modifiedMs, ...childModifiedTimes];
}

async function loadChildModifiedTimes(params: { directoryPath: string }): Promise<number[]> {
  const namesResult = await loadDirectoryNames({ path: params.directoryPath });

  if (namesResult.kind === 'failed') {
    return [];
  }

  const childPaths = namesResult.value
    .slice(0, MAX_CHILDREN_PER_DIRECTORY)
    .map((name) => join(params.directoryPath, name));
  const childStatsResults = await Promise.all(
    childPaths.map((childPath) => loadEntryStats({ path: childPath })),
  );

  return childStatsResults.flatMap((childStatsResult) => {
    if (childStatsResult.kind === 'failed') {
      return [];
    }

    return [childStatsResult.value.modifiedMs];
  });
}
