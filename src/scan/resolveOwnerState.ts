import { basename } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type {
  CatalogOwner,
  CatalogOwnerBundleIdFamily,
  MacBundleId,
} from '../catalog/catalogOwner.js';
import { parseMacBundleId } from '../catalog/catalogOwner.js';
import { isAnyBundleRunning } from '../system/isAnyBundleRunning.js';
import type { InstalledApp, SystemApp } from './scanPlatform.js';

export type OwnerState = 'running' | 'stopped' | 'unknown';

// Reverse-DNS names with at least three segments; shorter names collide with ordinary folder names.
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){2,}$/;

// A Group Containers folder of Apple's own apps is named `group.com.apple.<name>`.
const APPLE_BUNDLE_ID_PREFIXES = ['com.apple.', 'group.com.apple.'];

// A folder shared by one developer's apps is named `<team id>.<bundle id>`; the team id Apple
// assigns is ten upper-case letters and digits.
const TEAM_ID_PREFIX_PATTERN = /^[A-Z0-9]{10}\./;

export function isBundleIdShape(params: { name: string }): boolean {
  return BUNDLE_ID_PATTERN.test(params.name);
}

/**
 * The folder name as the bundle id it is shaped like, a team-id prefix taken off; `null` for any
 * other name, a team-prefixed one whose rest is no bundle id included.
 */
export function parseBundleIdShapedName(params: { name: string }): MacBundleId | null {
  const teamIdPrefix = TEAM_ID_PREFIX_PATTERN.exec(params.name);

  if (teamIdPrefix !== null) {
    const unprefixedName = params.name.slice(teamIdPrefix[0].length);

    // The whole name would read the team id as a vendor, which matches no installed app, so the
    // shared folder of an installed app such as `2BUA8C4S2C.com.1password` would pass as a leftover.
    if (!isBundleIdShape({ name: unprefixedName })) {
      return null;
    }

    return parseMacBundleId({ text: unprefixedName });
  }

  if (!isBundleIdShape({ name: params.name })) {
    return null;
  }

  return parseMacBundleId({ text: params.name });
}

export function isAppleBundleId(params: { bundleId: MacBundleId }): boolean {
  return APPLE_BUNDLE_ID_PREFIXES.some((prefix) => params.bundleId.startsWith(prefix));
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
      return params.entry.owner === null ? null : params.entry.owner.app;
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

/**
 * Whether the installed app is the owner: for a bundle id, the app of that id or one nesting it as
 * a helper; for a family, an app whose own id belongs to it. A family takes no nested helper, so an
 * app that bundles one of its helpers, such as Creative Cloud, never counts as one of its apps.
 */
function isOwnerApp(params: { owner: CatalogOwner; app: InstalledApp }): boolean {
  switch (params.owner.kind) {
    case 'bundleId':
      return (
        params.app.bundleId === params.owner.bundleId ||
        params.app.nestedBundleIds.includes(params.owner.bundleId)
      );
    case 'bundleIdFamily': {
      const appBundleId = params.app.bundleId;

      if (appBundleId === null) {
        return false;
      }

      return isFamilyBundleId({ family: params.owner, bundleId: appBundleId });
    }
  }
}

/** Whether the system app is the owner, by its own id alone, as `isOwnerApp` tells an app. */
function isOwnerSystemApp(params: { owner: CatalogOwner; app: SystemApp }): boolean {
  switch (params.owner.kind) {
    case 'bundleId':
      return params.app.bundleId === params.owner.bundleId;
    case 'bundleIdFamily':
      return isFamilyBundleId({ family: params.owner, bundleId: params.app.bundleId });
  }
}

function isFamilyBundleId(params: {
  family: CatalogOwnerBundleIdFamily;
  bundleId: MacBundleId;
}): boolean {
  return params.family.bundleIdPrefixes.some(
    (prefix) => params.bundleId === prefix || params.bundleId.startsWith(`${prefix}.`),
  );
}

/**
 * The bundle paths of the installed apps that are the owner, as `isOwnerApp` tells them, then of
 * the system apps that are it.
 */
export function findOwnerBundlePaths(params: {
  owner: CatalogOwner | null;
  installedApps: InstalledApp[];
  systemApps: SystemApp[];
}): string[] {
  const owner = params.owner;

  if (owner === null) {
    return [];
  }

  return [
    ...params.installedApps.filter((app) => isOwnerApp({ owner: owner, app: app })),
    ...params.systemApps.filter((app) => isOwnerSystemApp({ owner: owner, app: app })),
  ].map((app) => app.bundlePath);
}

/**
 * True when an owner is set and neither a system app nor an app of the complete list of installed
 * apps is it; false for no owner, and while the list is incomplete, since it may miss the owner.
 */
export function isOwnerUninstalled(params: {
  owner: CatalogOwner | null;
  installedApps: InstalledApp[];
  systemApps: SystemApp[];
  isInstalledAppListComplete: boolean;
}): boolean {
  const owner = params.owner;

  if (owner === null || !params.isInstalledAppListComplete) {
    return false;
  }

  const ownerBundlePaths = findOwnerBundlePaths({
    owner: owner,
    installedApps: params.installedApps,
    systemApps: params.systemApps,
  });

  return ownerBundlePaths.length === 0;
}

/**
 * The name of the app that is the owner: for a bundle id, the installed app of that id itself
 * before one that nests it as a helper; for a family, its first installed app; then the first
 * system app that is it. `null` when no app is the owner.
 */
export function findOwnerAppName(params: {
  owner: CatalogOwner | null;
  installedApps: InstalledApp[];
  systemApps: SystemApp[];
}): string | null {
  const owner = params.owner;

  if (owner === null) {
    return null;
  }

  const installedAppName = findOwnerInstalledAppName({
    owner: owner,
    installedApps: params.installedApps,
  });

  if (installedAppName !== null) {
    return installedAppName;
  }

  const systemApp = params.systemApps.find((app) => isOwnerSystemApp({ owner: owner, app: app }));

  return systemApp?.displayName ?? null;
}

function findOwnerInstalledAppName(params: {
  owner: CatalogOwner;
  installedApps: InstalledApp[];
}): string | null {
  const owner = params.owner;

  switch (owner.kind) {
    case 'bundleId': {
      const app =
        params.installedApps.find((installed) => installed.bundleId === owner.bundleId) ??
        params.installedApps.find((installed) =>
          installed.nestedBundleIds.includes(owner.bundleId),
        );

      return app?.displayName ?? null;
    }
    case 'bundleIdFamily': {
      const app = params.installedApps.find((installed) =>
        isOwnerApp({ owner: owner, app: installed }),
      );

      return app?.displayName ?? null;
    }
  }
}

/**
 * Returns `stopped` for no owner, `unknown` for any owner while the process list is missing,
 * `stopped` for an owner that no installed or system app is, and `running` when a process runs
 * from the bundle of any app that is the owner.
 */
export function resolveOwnerState(params: {
  owner: CatalogOwner | null;
  installedApps: InstalledApp[];
  systemApps: SystemApp[];
  processCommands: string[] | null;
}): OwnerState {
  if (params.owner === null) {
    return 'stopped';
  }

  if (params.processCommands === null) {
    return 'unknown';
  }

  const isRunning = isAnyBundleRunning({
    bundlePaths: findOwnerBundlePaths({
      owner: params.owner,
      installedApps: params.installedApps,
      systemApps: params.systemApps,
    }),
    processCommands: params.processCommands,
  });

  if (isRunning) {
    return 'running';
  }

  return 'stopped';
}
