import type { EngineProbeId } from '../../catalog/catalog.js';
import { stubPartNotBuilt } from '../../notBuilt.js';
import type { ContainerEngine } from '../explorePlatform.js';
import type { ExploreProbeEngineResult, ExploreProbeRun } from '../exploreProbe.js';

/**
 * Asks the engine over the first of its sockets that exists, trusted by `requestUnixSocket`, and
 * judges its images, containers, volumes and build cache. Never rejects.
 */
export function loadEngineFindings(_params: {
  run: ExploreProbeRun;
  engineProbeId: EngineProbeId;
  engine: ContainerEngine;
}): Promise<ExploreProbeEngineResult> {
  return Promise.resolve(
    stubPartNotBuilt<ExploreProbeEngineResult>({
      kind: 'failed',
      failure: { kind: 'socketMissing' },
    }),
  );
}
