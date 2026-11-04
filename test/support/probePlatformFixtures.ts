import type { ExploreProbePlatform } from '../../src/explore/exploreProbe.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';

/**
 * The macOS facts a probe reads, without a Homebrew prefix, so no test reads the real ones; a
 * test of the prefixes passes its fixture prefixes.
 */
export function buildTestProbePlatform(
  overrides: Partial<ExploreProbePlatform> = {},
): ExploreProbePlatform {
  return {
    explore: overrides.explore ?? darwinPlatform.explore,
    homebrewPrefixPaths: overrides.homebrewPrefixPaths ?? [],
    privacyDenialCode:
      overrides.privacyDenialCode === undefined
        ? darwinPlatform.system.privacyDenialCode
        : overrides.privacyDenialCode,
  };
}
