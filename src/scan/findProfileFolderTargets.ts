import type { CatalogEntry, CatalogSelectionProfileFolders } from '../catalog/catalog.js';
import { throwPartNotBuilt } from '../notBuilt.js';
import type { CatalogEntryTargets } from './findCatalogTargets.js';

/**
 * Lists one item per child folder of `path` that holds the selection's `markerName`, its targets
 * the selection's `subpaths` that exist in it. A missing path adds nothing; an unreadable one adds
 * an issue.
 */
export function findProfileFolderTargets(_params: {
  entry: CatalogEntry;
  selection: CatalogSelectionProfileFolders;
  path: string;
  privacyDenialCode: string | null;
}): Promise<CatalogEntryTargets> {
  return throwPartNotBuilt();
}
