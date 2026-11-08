import { describe, expect, test } from 'bun:test';
import type { CatalogEntry } from '../../../src/catalog/catalog.js';
import { resolveCatalogLocation } from '../../../src/catalog/resolveCatalogLocation.js';
import type { EnvironmentLocation } from '../../../src/environment/environmentLocation.js';
import { findEnvironmentLocationPath } from '../../../src/environment/environmentLocation.js';
import { isSameOrInsidePath } from '../../../src/path/isSameOrInsidePath.js';
import { joinAbsolutePath } from '../../../src/path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../../src/path/parseAbsolutePath.js';
import { WIN32_CATALOG } from '../../../src/platform/win32/catalog/win32Catalog.js';
import { isLocationUnderRoot } from '../../support/catalogLocationFixtures.js';
import { EXAMPLE_WIN32_ENVIRONMENT } from '../../support/environmentFixtures.js';

const ENVIRONMENT = EXAMPLE_WIN32_ENVIRONMENT;

/** Programs whose image names other apps share, so none may hold an entry back. */
const SHARED_IMAGE_NAMES = ['msedgewebview2.exe', 'update.exe', 'squirrel.exe'];

/** The images of the Chromium browsers, which keep their caches inside a profile. */
const CHROMIUM_BROWSER_IMAGE_NAMES = ['brave.exe', 'chrome.exe', 'msedge.exe'];

/** A backslash or a colon, so also a drive letter, which no name of a catalog path may hold. */
const FORBIDDEN_PATH_CHARACTER_PATTERN = /[\\:]/;

/** A location the catalog names, with what names it for a failure message. */
type NamedLocation = { name: string; location: EnvironmentLocation };

describe('WIN32_CATALOG', () => {
  test('gives every entry its own id in kebab case', () => {
    const ids = WIN32_CATALOG.entries.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([]);
  });

  test('owns every entry by no program or by images of its own program', () => {
    const otherOwnerIds = WIN32_CATALOG.entries
      .filter((entry) => entry.owner !== null && entry.owner.app.kind !== 'executable')
      .map((entry) => entry.id);
    const sharedImageIds = WIN32_CATALOG.entries
      .filter(
        (entry) =>
          entry.owner?.app.kind === 'executable' &&
          entry.owner.app.imageNames.some((imageName) => SHARED_IMAGE_NAMES.includes(imageName)),
      )
      .map((entry) => entry.id);

    expect(otherOwnerIds).toEqual([]);
    expect(sharedImageIds).toEqual([]);
  });

  test('resolves every location below its root in a Windows environment', () => {
    const unresolvedNames = listNamedLocations()
      .filter(
        (namedLocation) =>
          !isLocationUnderRoot({ location: namedLocation.location, environment: ENVIRONMENT }),
      )
      .map((namedLocation) => namedLocation.name);

    expect(WIN32_CATALOG.entries.length).toBeGreaterThan(0);
    expect(unresolvedNames).toEqual([]);
  });

  test('names every location and excluded folder by plain names, with no backslash or drive letter', () => {
    const forbiddenPathNames = listNamedLocations()
      .filter((namedLocation) => FORBIDDEN_PATH_CHARACTER_PATTERN.test(namedLocation.location.path))
      .map((namedLocation) => namedLocation.name);
    const forbiddenExcludedNames = WIN32_CATALOG.projectSearchExcludedNames.filter(
      (name) => FORBIDDEN_PATH_CHARACTER_PATTERN.test(name) || name.includes('/'),
    );

    expect(forbiddenPathNames).toEqual([]);
    expect(forbiddenExcludedNames).toEqual([]);
  });

  test('offers no guarded folder whole and nothing inside a sensitive folder', () => {
    const guardedPaths = [...ENVIRONMENT.protectedRealPaths, ...ENVIRONMENT.sensitiveRealPaths];
    const insideSensitiveIds = WIN32_CATALOG.entries
      .filter((entry) =>
        ENVIRONMENT.sensitiveRealPaths.some((sensitivePath) =>
          isSameOrInsidePath({
            rules: ENVIRONMENT.pathRules,
            path: resolveEntryPath({ entry: entry }),
            parentPath: sensitivePath,
          }),
        ),
      )
      .map((entry) => entry.id);
    const offeringGuardedIds = WIN32_CATALOG.entries
      .filter((entry) =>
        guardedPaths.some((guardedPath) =>
          isOfferingGuardedPath({ entry: entry, guardedPath: guardedPath }),
        ),
      )
      .map((entry) => entry.id);

    expect(ENVIRONMENT.sensitiveRealPaths.length).toBeGreaterThan(2);
    expect(insideSensitiveIds).toEqual([]);
    expect(offeringGuardedIds).toEqual([]);
  });

  test('keeps every browser cache inside the first profile, which stays guarded with its folder of profiles', () => {
    const userDataPaths = WIN32_CATALOG.protectedLocations
      .filter((location) => location.path.endsWith('/User Data'))
      .flatMap((location) => {
        const path = findEnvironmentLocationPath({ folders: ENVIRONMENT, location: location });

        return path === null ? [] : [path];
      });
    const unguardedProfilePaths = userDataPaths
      .map((userDataPath) => buildDefaultProfilePath({ userDataPath: userDataPath }))
      .filter((profilePath) => !ENVIRONMENT.protectedRealPaths.includes(profilePath));
    const misplacedIds = WIN32_CATALOG.entries
      .filter((entry) => isMisplacedBrowserCache({ entry: entry, userDataPaths: userDataPaths }))
      .map((entry) => entry.id);

    expect(userDataPaths.length).toBe(CHROMIUM_BROWSER_IMAGE_NAMES.length);
    expect(unguardedProfilePaths).toEqual([]);
    expect(misplacedIds).toEqual([]);
  });
});

/** Every location of the catalog: entries, install folders, probes, file roots, guarded folders. */
function listNamedLocations(): NamedLocation[] {
  const entryLocations = WIN32_CATALOG.entries.flatMap((entry) => {
    const installFolder =
      entry.owner?.app.kind === 'executable' ? entry.owner.app.installFolder : null;

    return [
      { name: entry.id, location: entry },
      ...(installFolder === null
        ? []
        : [{ name: `${entry.id} install folder`, location: installFolder }]),
    ];
  });
  const pnpmInstallPlaces = WIN32_CATALOG.explore.pnpmInstallPlaces;
  const exploreLocations = [
    ...pnpmInstallPlaces.homes,
    ...pnpmInstallPlaces.corepackRoots,
    ...pnpmInstallPlaces.launchers,
    ...pnpmInstallPlaces.npmPrefixes,
    WIN32_CATALOG.explore.pnpmStoreRoot,
    ...(WIN32_CATALOG.explore.pnpmXdgStoreRoot === null
      ? []
      : [WIN32_CATALOG.explore.pnpmXdgStoreRoot]),
    WIN32_CATALOG.explore.androidSdkRoot,
    WIN32_CATALOG.explore.vscodeProfilesRoot,
  ].map((location) => ({ name: `explore ${location.path}`, location: location }));
  // A known folder is the root it names, wherever Windows keeps it, so only the rest is checked.
  const userFileLocations = WIN32_CATALOG.userFileRoots.flatMap((location) =>
    location.root === 'knownFolder'
      ? []
      : [{ name: `user files ${location.path}`, location: location }],
  );
  const guardedLocations = [
    ...WIN32_CATALOG.protectedLocations,
    ...WIN32_CATALOG.sensitiveLocations,
  ].flatMap((location) =>
    location.root === 'knownFolder'
      ? []
      : [{ name: `guarded ${location.root}/${location.path}`, location: location }],
  );

  return [...entryLocations, ...exploreLocations, ...userFileLocations, ...guardedLocations];
}

/**
 * Whether the entry offers the guarded path or a folder holding it: a `path` entry by its own
 * folder, a `profileFolders` entry by its own folder too, which may itself be a profile, and a
 * `children` entry by any child of its folder.
 */
function isOfferingGuardedPath(params: { entry: CatalogEntry; guardedPath: string }): boolean {
  const entryPath = resolveEntryPath({ entry: params.entry });

  switch (params.entry.selection.kind) {
    case 'path':
    case 'profileFolders':
      return isSameOrInsidePath({
        rules: ENVIRONMENT.pathRules,
        path: params.guardedPath,
        parentPath: entryPath,
      });
    case 'children':
      return isStrictlyInsidePath({ path: params.guardedPath, parentPath: entryPath });
  }
}

/**
 * Whether the entry lies in a browser's folder of profiles other than as a cache inside its first
 * profile, or is a browser's cache outside every guarded folder of profiles.
 */
function isMisplacedBrowserCache(params: {
  entry: CatalogEntry;
  userDataPaths: AbsolutePath[];
}): boolean {
  const entryPath = resolveEntryPath({ entry: params.entry });
  const isBrowserOwned =
    params.entry.owner?.app.kind === 'executable' &&
    params.entry.owner.app.imageNames.some((imageName) =>
      CHROMIUM_BROWSER_IMAGE_NAMES.includes(imageName),
    );
  const userDataPath =
    params.userDataPaths.find((path) =>
      isSameOrInsidePath({ rules: ENVIRONMENT.pathRules, path: entryPath, parentPath: path }),
    ) ?? null;

  if (userDataPath === null) {
    return isBrowserOwned;
  }

  return (
    params.entry.selection.kind !== 'path' ||
    !isStrictlyInsidePath({
      path: entryPath,
      parentPath: buildDefaultProfilePath({ userDataPath: userDataPath }),
    })
  );
}

function isStrictlyInsidePath(params: { path: string; parentPath: string }): boolean {
  return (
    isSameOrInsidePath({
      rules: ENVIRONMENT.pathRules,
      path: params.path,
      parentPath: params.parentPath,
    }) &&
    !isSameOrInsidePath({
      rules: ENVIRONMENT.pathRules,
      path: params.parentPath,
      parentPath: params.path,
    })
  );
}

function buildDefaultProfilePath(params: { userDataPath: AbsolutePath }): AbsolutePath {
  return joinAbsolutePath({
    rules: ENVIRONMENT.pathRules,
    parentPath: params.userDataPath,
    names: ['Default'],
  });
}

function resolveEntryPath(params: { entry: CatalogEntry }): AbsolutePath {
  return resolveCatalogLocation({ environment: ENVIRONMENT, location: params.entry });
}
