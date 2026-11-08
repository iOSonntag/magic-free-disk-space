import type { CatalogEntry } from '../../../src/catalog/catalog.js';

/** Each entry's risk and path by its id, the pin a group's test compares whole. */
export function buildRiskAndPathById(
  entries: CatalogEntry[],
): Record<string, [CatalogEntry['risk'], string]> {
  return Object.fromEntries(entries.map((entry) => [entry.id, [entry.risk, entry.path]]));
}
