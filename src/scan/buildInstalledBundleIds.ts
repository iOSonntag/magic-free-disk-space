import type { MacBundleId } from '../catalog/catalogOwner.js';
import type { InstalledApp } from './loadInstalledApps.js';

export function buildInstalledBundleIds(params: { apps: InstalledApp[] }): Set<MacBundleId> {
  const bundleIds = new Set<MacBundleId>();

  for (const app of params.apps) {
    if (app.bundleId !== null) {
      bundleIds.add(app.bundleId);
    }

    for (const nestedBundleId of app.nestedBundleIds) {
      bundleIds.add(nestedBundleId);
    }
  }

  return bundleIds;
}
