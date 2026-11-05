import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreProbeStart } from '../../src/explore/startExploreProbes.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';
import { buildFixtureToolLocations } from './probeFakeTools.js';
import { buildEmptyProjectPinsLoad } from './projectPinsFixtures.js';

/** How long the probes of a test start may take. */
const TEST_PROBE_TIMEOUT_MS = 10_000;

/**
 * The start of the probes over `environment` with the test platform, and unless `params` says
 * otherwise, no tool, no process, no active Xcode, nothing pinned, and both cutoffs 0.
 */
export function buildTestProbeStart(
  params: { environment: Environment } & Partial<ExploreProbeStart>,
): ExploreProbeStart {
  return {
    platform: buildTestProbePlatform(),
    toolInstallLocations: buildFixtureToolLocations({}),
    runningProcesses: Promise.resolve(buildRunningCommandLines([])),
    activeXcodeBundlePath: Promise.resolve(null),
    projectPins: buildEmptyProjectPinsLoad(),
    timeoutMs: TEST_PROBE_TIMEOUT_MS,
    unusedCutoffMs: 0,
    staleCutoffMs: 0,
    ...params,
  };
}
