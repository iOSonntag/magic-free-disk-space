import { describe, expect, test } from 'bun:test';
import type { CatalogOwner } from '../../../src/catalog/catalogOwner.js';
import { darwinPlatform } from '../../../src/platform/darwin/darwinPlatform.js';
import { isAppleBundleId } from '../../../src/scan/resolveOwnerState.js';
import { isLocationUnderRoot } from '../../support/catalogLocationFixtures.js';
import { exampleDarwinEnvironment } from '../../support/environmentFixtures.js';

/** The kinds of owner a macOS entry may name besides `null` for no app: an app by its bundle id. */
const DARWIN_OWNER_KINDS: CatalogOwner['kind'][] = ['bundleId', 'bundleIdFamily'];

describe('the catalog of darwinPlatform', () => {
  test('every entry is owned by no app, a bundle id or a family of bundle ids', () => {
    const otherOwnerIds = darwinPlatform.catalog.entries
      .filter((entry) => entry.owner !== null && !DARWIN_OWNER_KINDS.includes(entry.owner.app.kind))
      .map((entry) => entry.id);

    expect(otherOwnerIds).toEqual([]);
  });

  test('every app of macOS that owns an entry is a system app, and every system app owns one', () => {
    const ownerBundleIds = darwinPlatform.catalog.entries.flatMap((entry) =>
      entry.owner !== null && entry.owner.app.kind === 'bundleId' ? [entry.owner.app.bundleId] : [],
    );
    const systemBundleIds = darwinPlatform.scan.systemApps.map((app) => app.bundleId);
    const unlistedAppleOwnerIds = ownerBundleIds.filter(
      (bundleId) =>
        isAppleBundleId({ bundleId: bundleId }) &&
        // Xcode comes from the App Store into the app folder, which lists it as an installed app.
        bundleId !== 'com.apple.dt.Xcode' &&
        !systemBundleIds.includes(bundleId),
    );

    expect(unlistedAppleOwnerIds).toEqual([]);
    expect(systemBundleIds.filter((bundleId) => !ownerBundleIds.includes(bundleId))).toEqual([]);
  });

  test('every entry resolves under its root in a fixture environment, none below AppData', () => {
    const unresolvedIds = darwinPlatform.catalog.entries
      .filter(
        (entry) => !isLocationUnderRoot({ location: entry, folders: exampleDarwinEnvironment }),
      )
      .map((entry) => entry.id);

    expect(darwinPlatform.catalog.entries.length).toBeGreaterThan(0);
    expect(unresolvedIds).toEqual([]);
  });
});
