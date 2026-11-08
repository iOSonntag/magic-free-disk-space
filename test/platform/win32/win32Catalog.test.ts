import { describe, expect, test } from 'bun:test';
import type { CatalogEntry } from '../../../src/catalog/catalog.js';
import type { EnvironmentLocation } from '../../../src/environment/environmentLocation.js';
import {
  findEnvironmentLocationPaths,
  resolveEnvironmentLocation,
} from '../../../src/environment/environmentLocation.js';
import { isSameOrInsidePath } from '../../../src/path/isSameOrInsidePath.js';
import { isStrictlyInsidePath } from '../../../src/path/isStrictlyInsidePath.js';
import { joinAbsolutePath } from '../../../src/path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../../src/path/parseAbsolutePath.js';
import { WIN32_CATALOG } from '../../../src/platform/win32/catalog/win32Catalog.js';
import {
  isLocationUnderRoot,
  listMisnamedCatalogIds,
} from '../../support/catalogLocationFixtures.js';
import { exampleWin32Environment } from '../../support/environmentFixtures.js';

/** Programs whose image names other apps share, so none may hold an entry back. */
const sharedImageNames = ['msedgewebview2.exe', 'update.exe', 'squirrel.exe'];

/** The images of the Chromium browsers, which keep their caches inside a profile. */
const chromiumBrowserImageNames = ['brave.exe', 'chrome.exe', 'msedge.exe'];

/** A backslash or a colon, so also a drive letter, which no name of a catalog path may hold. */
const forbiddenPathCharacterPattern = /[\\:]/;

/**
 * The backgrounds the user uploaded to Teams, which lie among the folders of its caches; the scan
 * refuses each as sensitive, so the catalog may name the caches around them.
 */
const teamsBackgroundRealPaths = [
  'C:\\Users\\tester\\AppData\\Local\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\\Microsoft\\MSTeams\\Backgrounds',
  'C:\\Users\\tester\\AppData\\Roaming\\Microsoft\\Teams\\Backgrounds',
];

/** A location the catalog names, with what names it for a failure message. */
type NamedLocation = { name: string; location: EnvironmentLocation };

describe('WIN32_CATALOG', () => {
  test('gives every entry its own id in kebab case', () => {
    expect(listMisnamedCatalogIds({ entries: WIN32_CATALOG.entries })).toEqual([]);
  });

  test('owns every entry by no program or by images of its own program', () => {
    const otherOwnerIds = WIN32_CATALOG.entries
      .filter((entry) => entry.owner !== null && entry.owner.app.kind !== 'executable')
      .map((entry) => entry.id);
    const sharedImageIds = WIN32_CATALOG.entries
      .filter(
        (entry) =>
          entry.owner?.app.kind === 'executable' &&
          entry.owner.app.imageNames.some((imageName) => sharedImageNames.includes(imageName)),
      )
      .map((entry) => entry.id);

    expect(otherOwnerIds).toEqual([]);
    expect(sharedImageIds).toEqual([]);
  });

  test('resolves every location below its root in a Windows environment', () => {
    const unresolvedNames = listNamedLocations()
      .filter(
        (namedLocation) =>
          !isLocationUnderRoot({
            location: namedLocation.location,
            environment: exampleWin32Environment,
          }),
      )
      .map((namedLocation) => namedLocation.name);

    expect(WIN32_CATALOG.entries.length).toBeGreaterThan(0);
    expect(unresolvedNames).toEqual([]);
  });

  test('names every location and excluded folder by plain names, with no backslash or drive letter', () => {
    const forbiddenPathNames = listNamedLocations()
      .filter((namedLocation) => forbiddenPathCharacterPattern.test(namedLocation.location.path))
      .map((namedLocation) => namedLocation.name);
    const forbiddenExcludedNames = WIN32_CATALOG.projectSearchExcludedNames.filter(
      (name) => forbiddenPathCharacterPattern.test(name) || name.includes('/'),
    );

    expect(forbiddenPathNames).toEqual([]);
    expect(forbiddenExcludedNames).toEqual([]);
  });

  test('offers no guarded folder whole and nothing inside a sensitive folder', () => {
    const guardedPaths = [
      ...exampleWin32Environment.protectedRealPaths,
      ...exampleWin32Environment.sensitiveRealPaths.filter(
        (sensitivePath) => !teamsBackgroundRealPaths.includes(sensitivePath),
      ),
    ];
    const insideSensitiveIds = WIN32_CATALOG.entries
      .filter((entry) =>
        exampleWin32Environment.sensitiveRealPaths.some((sensitivePath) =>
          isSameOrInsidePath({
            rules: exampleWin32Environment.pathRules,
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

    expect(insideSensitiveIds).toEqual([]);
    expect(offeringGuardedIds).toEqual([]);
  });

  test("guards the user's Teams backgrounds among the cache folders it offers one by one", () => {
    const holdingIds = WIN32_CATALOG.entries
      .filter((entry) =>
        teamsBackgroundRealPaths.some((backgroundPath) =>
          isOfferingGuardedPath({ entry: entry, guardedPath: backgroundPath }),
        ),
      )
      .map((entry) => entry.id);

    expect(holdingIds).toEqual(['teams-cache', 'teams-classic-cache']);
    expect(
      teamsBackgroundRealPaths.filter(
        (backgroundPath) => !exampleWin32Environment.sensitiveRealPaths.includes(backgroundPath),
      ),
    ).toEqual([]);
  });

  test('keeps every browser cache inside the first profile, which stays guarded with its folder of profiles', () => {
    const userDataPaths = findEnvironmentLocationPaths({
      folders: exampleWin32Environment,
      locations: WIN32_CATALOG.protectedLocations.filter((location) =>
        location.path.endsWith('/User Data'),
      ),
    });
    const unguardedProfilePaths = userDataPaths
      .map((userDataPath) => buildDefaultProfilePath({ userDataPath: userDataPath }))
      .filter((profilePath) => !exampleWin32Environment.protectedRealPaths.includes(profilePath));
    const misplacedIds = WIN32_CATALOG.entries
      .filter((entry) => isMisplacedBrowserCache({ entry: entry, userDataPaths: userDataPaths }))
      .map((entry) => entry.id);

    expect(userDataPaths.length).toBe(chromiumBrowserImageNames.length);
    expect(unguardedProfilePaths).toEqual([]);
    expect(misplacedIds).toEqual([]);
  });
});

/**
 * The locations at a fixed root of the catalog: the entries with their install folders, pnpm's
 * places, the Android SDK, VS Code's profiles, and the file roots and guarded folders outside a
 * known folder. It skips the explore fields Windows leaves empty or null, such as `ideVersionRoots`.
 */
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
    ...pnpmInstallPlaces.pnpmVersionsRoots,
    ...pnpmInstallPlaces.miseInstallsRoots,
    ...pnpmInstallPlaces.nodeVersionsRoots.map((nodeVersionsRoot) => nodeVersionsRoot.location),
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
        rules: exampleWin32Environment.pathRules,
        path: params.guardedPath,
        parentPath: entryPath,
      });
    case 'children':
      return isStrictlyInsidePath({
        rules: exampleWin32Environment.pathRules,
        path: params.guardedPath,
        parentPath: entryPath,
      });
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
      chromiumBrowserImageNames.includes(imageName),
    );
  const userDataPath =
    params.userDataPaths.find((path) =>
      isSameOrInsidePath({
        rules: exampleWin32Environment.pathRules,
        path: entryPath,
        parentPath: path,
      }),
    ) ?? null;

  if (userDataPath === null) {
    return isBrowserOwned;
  }

  return (
    params.entry.selection.kind !== 'path' ||
    !isStrictlyInsidePath({
      rules: exampleWin32Environment.pathRules,
      path: entryPath,
      parentPath: buildDefaultProfilePath({ userDataPath: userDataPath }),
    })
  );
}

function buildDefaultProfilePath(params: { userDataPath: AbsolutePath }): AbsolutePath {
  return joinAbsolutePath({
    rules: exampleWin32Environment.pathRules,
    parentPath: params.userDataPath,
    names: ['Default'],
  });
}

function resolveEntryPath(params: { entry: CatalogEntry }): AbsolutePath {
  return resolveEnvironmentLocation({ folders: exampleWin32Environment, location: params.entry });
}
