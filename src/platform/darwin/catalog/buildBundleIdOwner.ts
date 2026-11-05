import type { CatalogOwner } from '../../../catalog/catalogOwner.js';
import { parseMacBundleId } from '../../../catalog/catalogOwner.js';

export function buildBundleIdOwner(params: { text: string }): CatalogOwner {
  return { kind: 'bundleId', bundleId: parseMacBundleId({ text: params.text }) };
}
