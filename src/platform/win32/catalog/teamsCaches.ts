import type { CatalogLocation } from '../../../catalog/catalog.js';

/** The cache and logs of new Teams, inside its package of the Microsoft Store. */
export const teamsCacheFolder: CatalogLocation = {
  root: 'localAppData',
  path: 'Packages/MSTeams_8wekyb3d8bbwe/LocalCache/Microsoft/MSTeams',
};

/** The cache and logs of classic Teams. */
export const teamsClassicCacheFolder: CatalogLocation = {
  root: 'roamingAppData',
  path: 'Microsoft/Teams',
};
