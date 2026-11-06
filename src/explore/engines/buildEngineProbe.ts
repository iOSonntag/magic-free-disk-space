import type { EngineProbeId } from '../../catalog/catalog.js';
import type { ExploreProbeEngine } from '../exploreProbe.js';
import { loadEngineFindings } from './loadEngineFindings.js';

/** The probe of one engine, which reads that engine of the platform's list when it runs. */
export function buildEngineProbe(engineProbeId: EngineProbeId): ExploreProbeEngine {
  return {
    kind: 'engine',
    loadFindings: (run) =>
      loadEngineFindings({
        run: run,
        engineProbeId: engineProbeId,
        engine: run.platform.explore.containerEngines[engineProbeId],
      }),
  };
}
