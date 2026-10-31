import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';

/** Answers not judged, no findings and incomplete, so each pnpm store entry shows its advice. */
export async function loadPnpmStoreFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
  storeRootPathNames: string[];
}): Promise<ExploreProbeFilesResult> {
  return { kind: 'succeeded', value: { findings: [], isComplete: false } };
}
