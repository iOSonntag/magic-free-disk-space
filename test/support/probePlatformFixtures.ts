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
  return buildExploreProbePlatform({
    explore: overrides.explore ?? darwinPlatform.explore,
    tools: { ...darwinPlatform.tools, homebrewPrefixPaths: overrides.homebrewPrefixPaths ?? [] },
    system: {
      ...darwinPlatform.system,
      privacyDenialCode:
        overrides.privacyDenialCode === undefined
          ? darwinPlatform.system.privacyDenialCode
          : overrides.privacyDenialCode,
    },
  });
}
