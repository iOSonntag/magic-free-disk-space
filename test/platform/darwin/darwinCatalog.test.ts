import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { CatalogEntry } from '../../../src/catalog/catalog.js';
import type { CatalogOwner } from '../../../src/catalog/catalogOwner.js';
import type { Environment } from '../../../src/environment/buildEnvironment.js';
import { isSameOrInsidePath } from '../../../src/path/isSameOrInsidePath.js';
import { parseAbsolutePath } from '../../../src/path/parseAbsolutePath.js';
import { darwinPlatform } from '../../../src/platform/darwin/darwinPlatform.js';
import { getCatalogEntryPath } from '../../../src/scan/getCatalogEntryPath.js';
import { describeAwaitingWin32Platform } from '../../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../../support/fixtureRoot.js';

/** The kinds of owner a macOS entry may name besides `null` for no app: an app by its bundle id. */
const DARWIN_OWNER_KINDS: CatalogOwner['kind'][] = ['bundleId'];

/** True when the entry's path lies in the folder its root names, in the environment. */
function isResolvedUnderRoot(params: { entry: CatalogEntry; environment: Environment }): boolean {
  const path = getCatalogEntryPath({ environment: params.environment, entry: params.entry });

  switch (params.entry.root) {
    case 'home':
      return isSameOrInsidePath({
        rules: params.environment.pathRules,
        path: path,
        parentPath: params.environment.homeDir,
      });
    case 'temp':
      return isSameOrInsidePath({
        rules: params.environment.pathRules,
        path: path,
        parentPath: params.environment.tempDir,
      });
    case 'absolute': {
      const parsed = parseAbsolutePath({ rules: params.environment.pathRules, text: path });

      return parsed.kind === 'succeeded';
    }
  }
}

describeAwaitingWin32Platform('the catalog of darwinPlatform', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('every entry is owned by no app or by a bundle id', () => {
    const otherOwnerIds = darwinPlatform.catalog.entries
      .filter((entry) => entry.owner !== null && !DARWIN_OWNER_KINDS.includes(entry.owner.kind))
      .map((entry) => entry.id);

    expect(otherOwnerIds).toEqual([]);
  });

  test('every entry resolves under its root in a fixture environment', () => {
    const unresolvedIds = darwinPlatform.catalog.entries
      .filter((entry) => !isResolvedUnderRoot({ entry: entry, environment: environment }))
      .map((entry) => entry.id);

    expect(darwinPlatform.catalog.entries.length).toBeGreaterThan(0);
    expect(unresolvedIds).toEqual([]);
  });
});
