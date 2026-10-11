import type { InstalledApp } from '../../src/scan/loadInstalledApps.js';

export function buildTestInstalledApp(overrides: Partial<InstalledApp>): InstalledApp {
  return {
    bundlePath: '/Applications/Example.app',
    displayName: 'Example',
    bundleId: 'com.example.app',
    nestedBundleIds: [],
    ...overrides,
  };
}
