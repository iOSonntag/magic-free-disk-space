import type { CatalogEntryOwner } from '../../../catalog/catalog.js';
import { parseMacBundleId } from '../../../catalog/catalogOwner.js';

/** The app of the bundle id `text` as an entry's owner, with the advice for once it is gone. */
export function buildBundleIdOwner(params: {
  text: string;
  uninstalledAdvice?: string;
}): CatalogEntryOwner {
  return {
    app: { kind: 'bundleId', bundleId: parseMacBundleId({ text: params.text }) },
    uninstalledAdvice: params.uninstalledAdvice ?? null,
  };
}
