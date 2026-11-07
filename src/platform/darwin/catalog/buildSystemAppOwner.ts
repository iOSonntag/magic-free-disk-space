import type { CatalogEntryOwner } from '../../../catalog/catalog.js';
import type { SystemApp } from '../../../scan/scanPlatform.js';

/** The system app as an entry's owner, with no advice for once it is gone. */
export function buildSystemAppOwner(params: { app: SystemApp }): CatalogEntryOwner {
  return {
    app: { kind: 'bundleId', bundleId: params.app.bundleId },
    uninstalledAdvice: null,
  };
}
