import { describe, expect, test } from 'bun:test';
import { CATALOG_ENTRIES } from '../../src/catalog/catalogEntries.js';

const KEBAB_CASE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isBlankText(text: string): boolean {
  return text.trim() === '';
}

function isInsideFolder(path: string, folderPath: string): boolean {
  if (folderPath === '') {
    return path !== '';
  }

  return path.startsWith(`${folderPath}/`);
}

describe('CATALOG_ENTRIES', () => {
  test('ids are unique and kebab-case', () => {
    const ids = CATALOG_ENTRIES.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !KEBAB_CASE_ID_PATTERN.test(id))).toEqual([]);
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

  test('delete entries sit in the home or temp root', () => {
    const misplacedIds = CATALOG_ENTRIES.filter(
      (entry) => entry.removal.kind === 'delete' && entry.root !== 'home' && entry.root !== 'temp',
    ).map((entry) => entry.id);

    expect(misplacedIds).toEqual([]);
  });

  test('absolute entries are advice', () => {
    const absoluteDeleteIds = CATALOG_ENTRIES.filter(
      (entry) => entry.root === 'absolute' && entry.removal.kind !== 'advice',
    ).map((entry) => entry.id);

    expect(absoluteDeleteIds).toEqual([]);
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

  test('the staleDays age rule appears only with children scope', () => {
    const misscopedIds = CATALOG_ENTRIES.filter(
      (entry) => entry.ageRule === 'staleDays' && entry.scope !== 'children',
    ).map((entry) => entry.id);

    expect(misscopedIds).toEqual([]);
  });

  test('a self entry inside a children folder comes before that folder', () => {
    const misorderedPairs = CATALOG_ENTRIES.flatMap((folderEntry, folderIndex) => {
      if (folderEntry.scope !== 'children') {
        return [];
      }

      return CATALOG_ENTRIES.filter(
        (entry, entryIndex) =>
          entry.scope === 'self' &&
          entry.root === folderEntry.root &&
          entryIndex > folderIndex &&
          isInsideFolder(entry.path, folderEntry.path),
      ).map((entry) => `${entry.id} comes after ${folderEntry.id}`);
    });

    expect(misorderedPairs).toEqual([]);
  });

  test('no entry holds a user path or an e-mail address', () => {
    const serializedEntries = JSON.stringify(CATALOG_ENTRIES);

    expect(serializedEntries).not.toContain('/Users/');
    expect(serializedEntries).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});
