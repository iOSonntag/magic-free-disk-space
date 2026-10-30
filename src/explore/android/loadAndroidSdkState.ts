import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';

/** What the reads of the SDK and of `~/.android/avd` found; `sdkRoot` is `null` without an SDK. */
export type AndroidSdkState = { sdkRoot: AbsolutePath | null };

/**
 * Reads the SDK and the AVDs once, for the three Android probes and the rechecks of their units.
 * A read that is absent or unfit is a fact of the state; only a failed read fails.
 */
export function loadAndroidSdkState(_params: {
  homeDir: string;
}): Promise<Result<AndroidSdkState, ExploreFileUnreadable>> {
  throw new Error('loadAndroidSdkState is not built yet (part 2A)');
}
