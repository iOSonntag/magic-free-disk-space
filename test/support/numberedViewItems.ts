import type { ItemView, ScanView } from '../../src/report/buildScanView.js';

/** Every numbered item of `view`, top to bottom as the app and the CLI show them. */
export function listNumberedViewItems(params: { view: ScanView }): ItemView[] {
  const sectionItems = params.view.sections.flatMap((section) => [
    ...section.items,
    ...(section.checkGroup?.items ?? []),
  ]);

  return [...sectionItems, ...(params.view.explore?.items ?? [])];
}
