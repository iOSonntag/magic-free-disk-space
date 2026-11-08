import type { CatalogLocation } from '../../catalog/catalog.js';

/** VS Code's folder of profiles, `~/Library/Application Support/Code/User/profiles`. */
export const vscodeProfilesRoot: CatalogLocation = {
  root: 'home',
  path: 'Library/Application Support/Code/User/profiles',
};
