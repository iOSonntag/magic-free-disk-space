import { describe, expect, test } from 'bun:test';
import type { CatalogEntry, CatalogLocation } from '../../../src/catalog/catalog.js';
import { resolveCatalogLocation } from '../../../src/catalog/resolveCatalogLocation.js';
import type { EnvironmentDirNames } from '../../../src/environment/buildEnvironment.js';
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
type NamedLocation = { name: string; location: CatalogLocation };

describe('WIN32_CATALOG', () => {
  test('gives every entry its own id in kebab case', () => {
    const ids = WIN32_CATALOG.entries.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([]);
  });

  test('owns every entry by no program or by images of its own program', () => {
    const otherOwnerIds = WIN32_CATALOG.entries
      .filter((entry) => entry.owner !== null && entry.owner.kind !== 'executable')
      .map((entry) => entry.id);
    const sharedImageIds = WIN32_CATALOG.entries
      .filter(
        (entry) =>
          entry.owner?.kind === 'executable' &&
          entry.owner.imageNames.some((imageName) => SHARED_IMAGE_NAMES.includes(imageName)),
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
    const userDataPaths = WIN32_CATALOG.protectedDirNames
      .filter((dirNames) => dirNames.names.at(-1) === 'User Data')
      .map((dirNames) => resolveDirNamesPath({ dirNames: dirNames }));
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
    const installFolder = entry.owner?.kind === 'executable' ? entry.owner.installFolder : null;

    return [
      { name: entry.id, location: entry },
      ...(installFolder === null
        ? []
        : [{ name: `${entry.id} install folder`, location: installFolder }]),
    ];
  });
  const exploreLocations = [
    ...WIN32_CATALOG.explore.pnpmHomes,
    WIN32_CATALOG.explore.pnpmStoreRoot,
    ...(WIN32_CATALOG.explore.pnpmXdgStoreRoot === null
      ? []
      : [WIN32_CATALOG.explore.pnpmXdgStoreRoot]),
    WIN32_CATALOG.explore.androidSdkRoot,
    WIN32_CATALOG.explore.vscodeProfilesRoot,
  ].map((location) => ({ name: `explore ${location.path}`, location: location }));
  const userFileLocations = WIN32_CATALOG.userFileRoots.flatMap((root) =>
    root.kind === 'location'
      ? [{ name: `user files ${root.location.path}`, location: root.location }]
      : [],
  );
  const guardedLocations = [
    ...WIN32_CATALOG.protectedDirNames,
    ...WIN32_CATALOG.sensitiveDirNames,
  ].map((dirNames) => ({
    name: `guarded ${dirNames.names.join('/')}`,
    location: toCatalogLocation({ dirNames: dirNames }),
  }));

  return [...entryLocations, ...exploreLocations, ...userFileLocations, ...guardedLocations];
}

/**
 * Whether the entry offers the guarded path or a folder holding it: a `self` entry by its own
 * folder, a `children` entry by any child of its folder.
 */
function isOfferingGuardedPath(params: { entry: CatalogEntry; guardedPath: string }): boolean {
  const entryPath = resolveEntryPath({ entry: params.entry });

  switch (params.entry.scope) {
    case 'self':
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
    params.entry.owner?.kind === 'executable' &&
    params.entry.owner.imageNames.some((imageName) =>
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
    params.entry.scope !== 'self' ||
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

function resolveDirNamesPath(params: { dirNames: EnvironmentDirNames }): AbsolutePath {
  return resolveCatalogLocation({
    environment: ENVIRONMENT,
    location: toCatalogLocation({ dirNames: params.dirNames }),
  });
}

function toCatalogLocation(params: { dirNames: EnvironmentDirNames }): CatalogLocation {
  return { root: params.dirNames.base, path: params.dirNames.names.join('/') };
}
