import type { CatalogLocation } from '../../catalog/catalog.js';

/** The place below the home folder at the folder names `names`, one name per level. */
export function buildHomeLocation(params: { names: string[] }): CatalogLocation {
  return { root: 'home', path: params.names.join('/') };
}
