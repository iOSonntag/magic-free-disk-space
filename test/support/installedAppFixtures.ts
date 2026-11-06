import type { InstalledApp } from '../../src/scan/scanPlatform.js';
import { buildTestMacBundleId } from './parsedValueFixtures.js';

/** The fields of an installed app, its bundle ids as text for `buildTestMacBundleId`. */
type InstalledAppOverrides = Partial<Omit<InstalledApp, 'bundleId' | 'nestedBundleIds'>> & {
  bundleId?: string | null;
  nestedBundleIds?: string[];
};

/** The facts of an app's bundle that no read gave: no version shown, no owner. */
export const TEST_INSTALLED_APP_FACTS_NONE = { bundleShortVersion: null, ownerUid: null };

export function buildTestInstalledApp(overrides: InstalledAppOverrides): InstalledApp {
  const bundleId = overrides.bundleId === undefined ? 'com.example.app' : overrides.bundleId;

  return {
    bundlePath: overrides.bundlePath ?? '/Applications/Example.app',
    displayName: overrides.displayName ?? 'Example',
    bundleId: bundleId === null ? null : buildTestMacBundleId({ text: bundleId }),
    nestedBundleIds: (overrides.nestedBundleIds ?? []).map((text) =>
      buildTestMacBundleId({ text: text }),
    ),
    bundleShortVersion:
      overrides.bundleShortVersion === undefined ? null : overrides.bundleShortVersion,
    ownerUid: overrides.ownerUid === undefined ? null : overrides.ownerUid,
  };
}
