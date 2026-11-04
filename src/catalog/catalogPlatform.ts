import type { CatalogEntry } from './catalog.js';

/** What the catalog takes from the operating system: its entries. */
export type CatalogPlatform = {
  entries: CatalogEntry[];
};
