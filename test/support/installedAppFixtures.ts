import type { InstalledApp } from '../../src/scan/scanPlatform.js';
import { buildTestMacBundleId } from './parsedValueFixtures.js';

/** The fields of an installed app, its bundle ids as text for `buildTestMacBundleId`. */
type InstalledAppOverrides = Partial<Omit<InstalledApp, 'bundleId' | 'nestedBundleIds'>> & {
  bundleId?: string | null;
  nestedBundleIds?: string[];
};

/** An installed app with the overrides given, else no installer of the system and no owner read. */
export function buildTestInstalledApp(overrides: InstalledAppOverrides): InstalledApp {
  const bundleId = overrides.bundleId === undefined ? 'com.example.app' : overrides.bundleId;

  return {
    bundlePath: overrides.bundlePath ?? '/Applications/Example.app',
    displayName: overrides.displayName ?? 'Example',
    bundleId: bundleId === null ? null : buildTestMacBundleId({ text: bundleId }),
    nestedBundleIds: (overrides.nestedBundleIds ?? []).map((text) =>
      buildTestMacBundleId({ text: text }),
    ),
    systemInstaller: overrides.systemInstaller === undefined ? null : overrides.systemInstaller,
    ownerUid: overrides.ownerUid === undefined ? null : overrides.ownerUid,
  };
}
