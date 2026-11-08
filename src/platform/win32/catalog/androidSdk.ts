import type { CatalogLocation } from '../../../catalog/catalog.js';

/** The Android SDK of Android Studio on Windows, `%LOCALAPPDATA%\Android\Sdk`. */
export const androidSdkRoot: CatalogLocation = { root: 'localAppData', path: 'Android/Sdk' };

/** The place at `path` below the Android SDK, its names joined by `/`. */
export function buildAndroidSdkLocation(params: { path: string }): CatalogLocation {
  return { root: androidSdkRoot.root, path: `${androidSdkRoot.path}/${params.path}` };
}
