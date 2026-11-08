import { describe, expect, test } from 'bun:test';
import type { CatalogEntry, ExploreProbeId } from '../../../src/catalog/catalog.js';
import { CATCH_ALL_ENTRIES } from '../../../src/platform/darwin/catalog/catchAlls.js';
import { CATALOG_ENTRIES } from '../../../src/platform/darwin/catalogEntries.js';
import { listMisnamedCatalogIds } from '../../support/catalogLocationFixtures.js';

/** A version such as `17.2` or `v3`, or a path character. */
const TITLE_VERSION_OR_PATH_PATTERN = /\d+\.\d+|\bv\d+\b|[/~]/i;

/** Every probe id, kept complete by the compiler. */
const EXPLORE_PROBE_IDS: Record<ExploreProbeId, true> = {
  simulatorDevices: true,
  dartPubCache: true,
  miseVersions: true,
  simulatorRuntimes: true,
  androidAvds: true,
  androidSystemImages: true,
  androidEmulator: true,
  homebrewAppleSilicon: true,
  homebrewIntel: true,
  vscodeExtensions: true,
  asdfVersions: true,
  nvmVersions: true,
  androidPlatforms: true,
  pnpmStores: true,
  pnpmStoresXdg: true,
  dockerDesktopEngine: true,
  orbStackEngine: true,
  colimaEngine: true,
  vagrantBoxes: true,
  icloudDownloads: true,
  downloadsInstallers: true,
  mailDownloads: true,
  ollamaModels: true,
  huggingFaceRepos: true,
  lmStudioModels: true,
  claudeTranscripts: true,
  claudeCodeVersions: true,
  ideVersions: true,
  rustupToolchains: true,
  condaPackages: true,
  fvmVersions: true,
};

function isBlankText(text: string): boolean {
  return text.trim() === '';
}

function isInsideFolder(path: string, folderPath: string): boolean {
  if (folderPath === '') {
    return path !== '';
  }

  return path.startsWith(`${folderPath}/`);
}

/** Each non-catch-all entry whose path lies inside a catch-all's folder, with that catch-all. */
function listEntriesInsideCatchAlls(): { entry: CatalogEntry; catchAll: CatalogEntry }[] {
  const catchAllIds = new Set(CATCH_ALL_ENTRIES.map((entry) => entry.id));

  return CATCH_ALL_ENTRIES.flatMap((catchAll) =>
    CATALOG_ENTRIES.filter(
      (entry) =>
        !catchAllIds.has(entry.id) &&
        entry.root === catchAll.root &&
        isInsideFolder(entry.path, catchAll.path),
    ).map((entry) => ({ entry: entry, catchAll: catchAll })),
  );
}

describe('CATALOG_ENTRIES', () => {
  test('ids are unique and kebab-case', () => {
    expect(listMisnamedCatalogIds({ entries: CATALOG_ENTRIES })).toEqual([]);
  });

  test('every entry has a title, an explanation, and a regeneration text', () => {
    const blankEntryIds = CATALOG_ENTRIES.filter(
      (entry) =>
        isBlankText(entry.title) ||
        isBlankText(entry.explanation) ||
        isBlankText(entry.regeneration),
    ).map((entry) => entry.id);

    expect(blankEntryIds).toEqual([]);
  });

  test('every advice text is non-empty', () => {
    const blankAdviceIds = CATALOG_ENTRIES.filter(
      (entry) => entry.removal.kind === 'advice' && isBlankText(entry.removal.advice),
    ).map((entry) => entry.id);

    expect(blankAdviceIds).toEqual([]);
  });

  test('delete entries sit in the home, temp, or user cache root', () => {
    const misplacedIds = CATALOG_ENTRIES.filter(
      (entry) =>
        entry.removal.kind === 'delete' && !['home', 'temp', 'userCache'].includes(entry.root),
    ).map((entry) => entry.id);

    expect(misplacedIds).toEqual([]);
  });

  test('absolute entries are never deleted as a path, only advised or explored', () => {
    const absoluteDeleteIds = CATALOG_ENTRIES.filter(
      (entry) => entry.root === 'absolute' && entry.removal.kind === 'delete',
    ).map((entry) => entry.id);

    expect(absoluteDeleteIds).toEqual([]);
  });

  test('every explore probe belongs to exactly one entry', () => {
    const probeIds: string[] = CATALOG_ENTRIES.flatMap((entry) =>
      entry.removal.kind === 'explore' ? [entry.removal.probe] : [],
    );

    expect(probeIds.toSorted()).toEqual(Object.keys(EXPLORE_PROBE_IDS).toSorted());
  });

  test('home and temp paths are relative and hold no parent segment', () => {
    const invalidIds = CATALOG_ENTRIES.filter(
      (entry) =>
        entry.root !== 'absolute' &&
        (entry.path.startsWith('/') || entry.path.split('/').includes('..')),
    ).map((entry) => entry.id);

    expect(invalidIds).toEqual([]);
  });

  test('absolute paths start with a slash', () => {
    const invalidIds = CATALOG_ENTRIES.filter(
      (entry) => entry.root === 'absolute' && !entry.path.startsWith('/'),
    ).map((entry) => entry.id);

    expect(invalidIds).toEqual([]);
  });

  test('risk never appears only with advice', () => {
    const neverDeleteIds = CATALOG_ENTRIES.filter(
      (entry) => entry.risk === 'never' && entry.removal.kind === 'delete',
    ).map((entry) => entry.id);

    expect(neverDeleteIds).toEqual([]);
  });

  test('the Trash is careful, because a deleted item does not come back', () => {
    expect(CATALOG_ENTRIES.find((entry) => entry.id === 'trash')?.risk).toBe('careful');
  });

  test('the unchangedDays age rule appears only with a children or a profile folders selection', () => {
    const misselectedIds = CATALOG_ENTRIES.filter(
      (entry) => entry.ageRule.kind === 'unchangedDays' && entry.selection.kind === 'path',
    ).map((entry) => entry.id);

    expect(misselectedIds).toEqual([]);
  });

  test('a path entry inside a children folder comes before that folder', () => {
    const misorderedPairs = CATALOG_ENTRIES.flatMap((folderEntry, folderIndex) => {
      if (folderEntry.selection.kind !== 'children') {
        return [];
      }

      return CATALOG_ENTRIES.filter(
        (entry, entryIndex) =>
          entry.selection.kind === 'path' &&
          entry.root === folderEntry.root &&
          entryIndex > folderIndex &&
          isInsideFolder(entry.path, folderEntry.path),
      ).map((entry) => `${entry.id} comes after ${folderEntry.id}`);
    });

    expect(misorderedPairs).toEqual([]);
  });

  test('every other entry comes before the catch-alls', () => {
    const catchAllIds = CATCH_ALL_ENTRIES.map((entry) => entry.id);
    const tailIds = CATALOG_ENTRIES.slice(-CATCH_ALL_ENTRIES.length).map((entry) => entry.id);

    expect(tailIds).toEqual(catchAllIds);
  });

  test('no title holds a version string or a raw path', () => {
    const invalidTitleIds = CATALOG_ENTRIES.filter((entry) =>
      TITLE_VERSION_OR_PATH_PATTERN.test(entry.title),
    ).map((entry) => entry.id);

    expect(invalidTitleIds).toEqual([]);
  });

  test('no two entries resolve to one path', () => {
    const resolvedPaths = CATALOG_ENTRIES.map((entry) => `${entry.root}:${entry.path}`);
    const duplicatePaths = resolvedPaths.filter(
      (resolvedPath, index) => resolvedPaths.indexOf(resolvedPath) !== index,
    );

    expect(duplicatePaths).toEqual([]);
  });

  test("no advice entry lies inside a catch-all's folder, where it would withhold that child", () => {
    const withholdingPairs = listEntriesInsideCatchAlls()
      .filter((pair) => pair.entry.removal.kind === 'advice')
      .map((pair) => `${pair.entry.id} inside ${pair.catchAll.id}`);

    expect(withholdingPairs).toEqual([]);
  });

  test("the explore entries inside a catch-all's folder, whose paths their probes reserve", () => {
    const exploreIds = listEntriesInsideCatchAlls()
      .filter((pair) => pair.entry.removal.kind === 'explore')
      .map((pair) => pair.entry.id);

    expect(exploreIds).toEqual(['huggingface-hub']);
  });

  test("no explore entry's path holds another entry's path", () => {
    const heldPairs = CATALOG_ENTRIES.flatMap((exploreEntry) => {
      if (exploreEntry.removal.kind !== 'explore') {
        return [];
      }

      return CATALOG_ENTRIES.filter(
        (entry) =>
          entry.id !== exploreEntry.id &&
          entry.root === exploreEntry.root &&
          (entry.path === exploreEntry.path || isInsideFolder(entry.path, exploreEntry.path)),
      ).map((entry) => `${entry.id} inside ${exploreEntry.id}`);
    });

    expect(heldPairs).toEqual([]);
  });

  test('no entry holds a user path or an e-mail address', () => {
    const serializedEntries = JSON.stringify(CATALOG_ENTRIES);

    expect(serializedEntries).not.toContain('/Users/');
    expect(serializedEntries).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});
