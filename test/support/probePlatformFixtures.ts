import type { ExploreProbePlatform } from '../../src/explore/exploreProbe.js';
import { buildExploreProbePlatform } from '../../src/explore/exploreProbe.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';

/**
 * The macOS facts a probe reads, without a Homebrew prefix, so no test reads the real ones; a
 * test of the prefixes passes its fixture prefixes.
 */
export function buildTestProbePlatform(
  overrides: Partial<ExploreProbePlatform> = {},
): ExploreProbePlatform {
  const probePlatform = buildExploreProbePlatform({
    explore: darwinPlatform.explore,
    tools: { ...darwinPlatform.tools, homebrewPrefixPaths: [] },
    system: darwinPlatform.system,
  });

  return { ...probePlatform, ...overrides };
}
