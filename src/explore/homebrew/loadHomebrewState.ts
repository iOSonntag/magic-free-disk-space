import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreToolCommandRun } from '../exploreProbe.js';
import type { ExploreToolFailure } from '../exploreUnit.js';

/** What `brew --cellar`, `brew cleanup -n`, and `brew autoremove -n` of one brew answered. */
export type HomebrewState = { cellarPath: AbsolutePath };

/**
 * Runs the three read-only commands of the located brew once, each with the time left before the
 * run's deadline, for its probe and the rechecks of its units.
 */
export function loadHomebrewState(
  _run: ExploreToolCommandRun,
): Promise<Result<HomebrewState, ExploreToolFailure>> {
  throw new Error('loadHomebrewState is not built yet (part 2B1)');
}
