import type { CatalogLocation } from '../../catalog/catalog.js';

/** VS Code's folder of profiles, `~/Library/Application Support/Code/User/profiles`. */
export const VSCODE_PROFILES_ROOT: CatalogLocation = {
  root: 'home',
  path: 'Library/Application Support/Code/User/profiles',
};
