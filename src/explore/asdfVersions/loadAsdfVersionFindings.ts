import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';

/** Answers not judged, no findings and incomplete, so the asdf entry shows its advice. */
export async function loadAsdfVersionFindings(params: {
  run: ExploreProbeToolRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeToolResult> {
  return { kind: 'succeeded', value: { findings: [], isComplete: false } };
}
