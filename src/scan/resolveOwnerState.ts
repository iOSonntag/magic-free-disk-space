import { basename } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { CatalogOwner, CatalogOwnerBundleId, MacBundleId } from '../catalog/catalogOwner.js';
import { parseMacBundleId } from '../catalog/catalogOwner.js';
import { isAnyBundleRunning } from '../system/isAnyBundleRunning.js';
import type { InstalledApp } from './scanPlatform.js';

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

  return parseMacBundleId({ text: params.name });
}

export function isAppleBundleId(params: { bundleId: MacBundleId }): boolean {
  return params.bundleId.startsWith(APPLE_BUNDLE_ID_PREFIX);
}

/**
 * Returns the owner of the path: the entry's owner for a `path` or a `profileFolders` entry; for a
 * `children` entry the child's own name when it is a bundle id, else the installed app named like
 * the child. `null` when no app owns it.
 */
export function resolveTargetOwner(params: {
  entry: CatalogEntry;
  path: string;
  installedApps: InstalledApp[];
}): CatalogOwner | null {
  switch (params.entry.selection.kind) {
    case 'path':
    case 'profileFolders':
      return params.entry.owner;
    case 'children':
      return resolveChildOwner({ path: params.path, installedApps: params.installedApps });
  }
}

function resolveChildOwner(params: {
  path: string;
  installedApps: InstalledApp[];
}): CatalogOwner | null {
  const name = basename(params.path);
  const nameBundleId = parseBundleIdShapedName({ name: name });

  if (nameBundleId !== null) {
    return { kind: 'bundleId', bundleId: nameBundleId };
  }

  const lowerCaseName = name.toLowerCase();
  const namedApp = params.installedApps.find(
    (app) => app.bundleId !== null && app.displayName.toLowerCase() === lowerCaseName,
  );

  if (namedApp === undefined) {
    return null;
  }

  return buildAppOwner({ app: namedApp });
}

/** An app owns its own bundle; one without a bundle id has no owner whose run can be told. */
export function buildAppOwner(params: { app: InstalledApp }): CatalogOwner | null {
  if (params.app.bundleId === null) {
    return null;
  }

  return { kind: 'bundleId', bundleId: params.app.bundleId };
}

/** The bundle paths of the installed apps that carry the owner's id, as app or as nested helper. */
export function findOwnerBundlePaths(params: {
  owner: CatalogOwner | null;
  installedApps: InstalledApp[];
}): string[] {
  if (params.owner === null) {
    return [];
  }

  switch (params.owner.kind) {
    case 'bundleId': {
      const bundleId = params.owner.bundleId;

      return params.installedApps
        .filter((app) => app.bundleId === bundleId || app.nestedBundleIds.includes(bundleId))
        .map((app) => app.bundlePath);
    }
  }
}

/**
 * The name of the installed app that carries the owner's id: the app of that id itself before an
 * app that nests it as a helper. `null` when no installed app carries it.
 */
export function findOwnerAppName(params: {
  owner: CatalogOwner | null;
  installedApps: InstalledApp[];
}): string | null {
  if (params.owner === null) {
    return null;
  }

  switch (params.owner.kind) {
    case 'bundleId': {
      const bundleId = params.owner.bundleId;
      const app =
        params.installedApps.find((installed) => installed.bundleId === bundleId) ??
        params.installedApps.find((installed) => installed.nestedBundleIds.includes(bundleId));

      return app?.displayName ?? null;
    }
  }
}

/**
 * Returns `stopped` for no owner, `unknown` for any owner while the process list is missing,
 * `stopped` for an owner that no installed app carries, and `running` when a process runs from
 * the owner's bundle.
 */
export function resolveOwnerState(params: {
  owner: CatalogOwner | null;
  installedApps: InstalledApp[];
  processCommands: string[] | null;
}): OwnerState {
  if (params.owner === null) {
    return 'stopped';
  }

  switch (params.owner.kind) {
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
