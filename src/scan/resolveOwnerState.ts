import { basename } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import { isAnyBundleRunning } from '../system/isAnyBundleRunning.js';
import type { InstalledApp } from './loadInstalledApps.js';

export type OwnerState = 'running' | 'stopped' | 'unknown';

// Reverse-DNS names with at least three segments; shorter names collide with ordinary folder names.
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){2,}$/;

const APPLE_BUNDLE_ID_PREFIX = 'com.apple.';

export function isBundleIdShape(params: { name: string }): boolean {
  return BUNDLE_ID_PATTERN.test(params.name);
}

export function isAppleBundleId(params: { bundleId: string }): boolean {
  return params.bundleId.startsWith(APPLE_BUNDLE_ID_PREFIX);
}

/**
 * Returns the bundle id of the app that owns the path: the entry's owner for a `self` entry;
 * for a `children` entry the child's own name when it is a bundle id, else the id of the
 * installed app named like the child. `null` when no app owns it.
 */
export function resolveOwnerBundleId(params: {
  entry: CatalogEntry;
  path: string;
  installedApps: InstalledApp[];
}): string | null {
  if (params.entry.scope === 'self') {
    return params.entry.ownerBundleId;
  }

  const name = basename(params.path);

  if (isBundleIdShape({ name: name })) {
    return name;
  }

  const lowerCaseName = name.toLowerCase();
  const namedApp = params.installedApps.find(
    (app) => app.bundleId !== null && app.displayName.toLowerCase() === lowerCaseName,
  );

  return namedApp?.bundleId ?? null;
}

/** The bundle paths of the installed apps that carry the id, as app or as nested helper. */
export function findOwnerBundlePaths(params: {
  ownerBundleId: string | null;
  installedApps: InstalledApp[];
}): string[] {
  const ownerBundleId = params.ownerBundleId;

  if (ownerBundleId === null) {
    return [];
  }

  return params.installedApps
    .filter((app) => app.bundleId === ownerBundleId || app.nestedBundleIds.includes(ownerBundleId))
    .map((app) => app.bundlePath);
}

/**
 * Returns `unknown` for any owner while the process list is missing, `stopped` for an owner
 * that no installed app carries, and `running` when a process runs from the owner's bundle.
 */
export function resolveOwnerState(params: {
  ownerBundleId: string | null;
  installedApps: InstalledApp[];
  processCommands: string[] | null;
}): OwnerState {
  if (params.ownerBundleId === null) {
    return 'stopped';
  }

  if (params.processCommands === null) {
    return 'unknown';
  }

  const isRunning = isAnyBundleRunning({
    bundlePaths: findOwnerBundlePaths({
      ownerBundleId: params.ownerBundleId,
      installedApps: params.installedApps,
    }),
    processCommands: params.processCommands,
  });

  if (isRunning) {
    return 'running';
  }

  return 'stopped';
}
