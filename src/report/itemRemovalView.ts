import type { CandidateRemoval } from '../scan/candidate.js';

/**
 * How an offered item goes: deleted as its paths, by its tool's command, over its engine's API,
 * or evicted from the Mac while iCloud keeps it.
 */
export type ItemRemovalView = 'delete' | 'tool' | 'engine' | 'evict';

const removalViews: Record<CandidateRemoval['kind'], ItemRemovalView> = {
  deletePaths: 'delete',
  deleteUnitPaths: 'delete',
  runTool: 'tool',
  callEngine: 'engine',
  evictUnitFiles: 'evict',
};

/** The removal of an item as the scan view and the plan word it, the same for both. */
export function buildItemRemovalView(params: { removal: CandidateRemoval }): ItemRemovalView {
  return removalViews[params.removal.kind];
}
