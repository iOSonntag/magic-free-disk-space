import { basename } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { CatalogOwner, CatalogOwnerBundleId, MacBundleId } from '../catalog/catalogOwner.js';
import { parseMacBundleId } from '../catalog/catalogOwner.js';
import { isAnyBundleRunning } from '../system/isAnyBundleRunning.js';
import type { InstalledApp } from './loadInstalledApps.js';

export type OwnerState = 'running' | 'stopped' | 'unknown';

// Reverse-DNS names with at least three segments; shorter names collide with ordinary folder names.
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){2,}$/;

const APPLE_BUNDLE_ID_PREFIX = 'com.apple.';

export function isBundleIdShape(params: { name: string }): boolean {
  return BUNDLE_ID_PATTERN.test(params.name);
}

/** The folder name as the bundle id it is shaped like; `null` for any other name. */
export function parseBundleIdShapedName(params: { name: string }): MacBundleId | null {
  if (!isBundleIdShape({ name: params.name })) {
    return null;
  }

  const bundleId = parseMacBundleId({ text: params.name });

  switch (bundleId.kind) {
    case 'succeeded':
      return bundleId.value;
    case 'failed':
      return null;
  }
}

export function isAppleBundleId(params: { bundleId: MacBundleId }): boolean {
  return params.bundleId.startsWith(APPLE_BUNDLE_ID_PREFIX);
}

/**
 * Returns the owner of the path: the entry's owner for a `self` entry; for a `children` entry
 * the child's own name when it is a bundle id, else the installed app named like the child.
 */
export function resolveTargetOwner(params: {
  entry: CatalogEntry;
  path: string;
  installedApps: InstalledApp[];
}): CatalogOwner {
  if (params.entry.scope === 'self') {
    return params.entry.owner;
  }

  const name = basename(params.path);
  const nameBundleId = parseBundleIdShapedName({ name: name });

  if (nameBundleId !== null) {
    return { kind: 'bundleId', bundleId: nameBundleId };
  }

  const lowerCaseName = name.toLowerCase();
  const namedApp = params.installedApps.find(
    (app) => app.bundleId !== null && app.displayName.toLowerCase() === lowerCaseName,
  );
  const namedAppBundleId = namedApp?.bundleId ?? null;

  if (namedAppBundleId === null) {
    return { kind: 'none' };
  }

  return { kind: 'bundleId', bundleId: namedAppBundleId };
}

/** The bundle paths of the installed apps that carry the owner's id, as app or as nested helper. */
export function findOwnerBundlePaths(params: {
  owner: CatalogOwner;
  installedApps: InstalledApp[];
}): string[] {
  switch (params.owner.kind) {
    case 'none':
      return [];
    case 'bundleId': {
      const bundleId = params.owner.bundleId;

      return params.installedApps
        .filter((app) => app.bundleId === bundleId || app.nestedBundleIds.includes(bundleId))
        .map((app) => app.bundlePath);
    }
  }
}

/**
 * Returns `unknown` for any owner while the process list is missing, `stopped` for an owner
 * that no installed app carries, and `running` when a process runs from the owner's bundle.
 */
export function resolveOwnerState(params: {
  owner: CatalogOwner;
  installedApps: InstalledApp[];
  processCommands: string[] | null;
}): OwnerState {
  switch (params.owner.kind) {
    case 'none':
      return 'stopped';
    case 'bundleId':
      return resolveBundleOwnerState({
        owner: params.owner,
        installedApps: params.installedApps,
        processCommands: params.processCommands,
      });
  }
}

function resolveBundleOwnerState(params: {
  owner: CatalogOwnerBundleId;
  installedApps: InstalledApp[];
  processCommands: string[] | null;
}): OwnerState {
  if (params.processCommands === null) {
    return 'unknown';
  }

  const isRunning = isAnyBundleRunning({
    bundlePaths: findOwnerBundlePaths({
      owner: params.owner,
      installedApps: params.installedApps,
    }),
    processCommands: params.processCommands,
  });

  if (isRunning) {
    return 'running';
  }

  return 'stopped';
}
