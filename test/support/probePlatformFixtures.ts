import type { ExplorePlatform } from '../../src/explore/explorePlatform.js';
import type { ExploreProbePlatform } from '../../src/explore/exploreProbe.js';
import { buildExploreProbePlatform } from '../../src/explore/exploreProbe.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { hostPlatform } from './platformFixtures.js';

/**
 * The host's facts a probe reads, without a Homebrew prefix, so no test reads the real ones. A
 * test names the explore facts or the Homebrew prefixes it changes in `params`.
 */
export function buildTestProbePlatform(
  params: {
    /** Explore facts that replace the host's, one field each. */
    explore?: Partial<ExplorePlatform>;
    /** The Homebrew prefixes of the tools slice; none when left out. */
    homebrewPrefixPaths?: AbsolutePath[];
  } = {},
): ExploreProbePlatform {
  return buildExploreProbePlatform({
    explore: { ...hostPlatform.explore, ...params.explore },
    tools: { ...hostPlatform.tools, homebrewPrefixPaths: params.homebrewPrefixPaths ?? [] },
    system: hostPlatform.system,
  });
}
