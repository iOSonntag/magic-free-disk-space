import type { Result } from '../result.js';
import type { Environment } from './buildEnvironment.js';
import type { EnvironmentFailure } from './loadEnvironment.js';

/**
 * What the environment takes from the operating system: the load of the run's folders, its
 * user, its path rules, and its protected roots, which refuses an unsafe setup.
 */
export type EnvironmentPlatform = {
  /** Never throws. */
  loadEnvironment: () => Promise<Result<Environment, EnvironmentFailure>>;
};
