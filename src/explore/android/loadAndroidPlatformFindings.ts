import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';

/** The platform folders of the SDK that no Gradle file found compiles against. */
export async function loadAndroidPlatformFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  return { kind: 'succeeded', value: { findings: [], isComplete: false } };
}
