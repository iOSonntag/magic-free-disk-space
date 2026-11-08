import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadPlacedFileIdentity } from '../../src/system/loadPlacedFileIdentity.js';
import { buildTestEntryReads } from '../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureFile, createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';

const fixtureModifiedMs = Date.UTC(2024, 0, 15, 12, 0, 0);

describe('loadPlacedFileIdentity', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('rejects a broken invariant of the entry reads, not a failed read', async () => {
    const filePath = join(fixtureRoot.homeDir, 'notes.txt');
    await createFixtureFile({ path: filePath, sizeBytes: 10, modifiedMs: fixtureModifiedMs });
    const invariantError = new Error('The entry reads hold a broken invariant');
    const entryReads = {
      ...buildTestEntryReads({ privateBytes: null }),
      loadEntryPlacement: (): never => {
        throw invariantError;
      },
    };
    const identity = loadPlacedFileIdentity({ path: filePath, entryReads: entryReads });

    await expect(identity).rejects.toBe(invariantError);
  });
});
