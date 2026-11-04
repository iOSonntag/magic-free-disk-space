import type { ExploreProbePlatform } from '../../src/explore/exploreProbe.js';
import { buildExploreProbePlatform } from '../../src/explore/exploreProbe.js';
import { HOST_PLATFORM } from './platformFixtures.js';

/**
 * The host's facts a probe reads, without a Homebrew prefix, so no test reads the real ones; a
 * test of the prefixes passes its fixture prefixes.
 */
export function buildTestProbePlatform(
  overrides: Partial<ExploreProbePlatform> = {},
): ExploreProbePlatform {
  const probePlatform = buildExploreProbePlatform({
    explore: HOST_PLATFORM.explore,
    tools: { ...HOST_PLATFORM.tools, homebrewPrefixPaths: [] },
    system: HOST_PLATFORM.system,
  });

  return { ...probePlatform, ...overrides };
}
