import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';

/** Answers not judged, no findings and incomplete, so the nvm entry shows its advice. */
export async function loadNvmVersionFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  return { kind: 'succeeded', value: { findings: [], isComplete: false } };
}
