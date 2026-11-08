import type { Result } from '../result.js';
import type { SystemCallFailure } from '../system/systemCallFailure.js';
import type { Environment } from './buildEnvironment.js';

/** Why the run cannot start. */
export type EnvironmentFailure =
  | { reason: 'runAsRoot' }
  /** A Windows run with an elevated token, as with "Run as administrator". */
  | { reason: 'runElevated' }
  | ({ reason: 'callFailed' } & SystemCallFailure)
  | { reason: 'unresolvable'; path: string; code: string }
  | { reason: 'homeNotOwned'; path: string }
  /** A Windows user folder that another account owns. */
  | { reason: 'profileNotOwned'; path: string }
  | { reason: 'tempOverlapsHome'; path: string }
  /** A temporary folder that is or holds a drive root or a folder the tool never deletes. */
  | { reason: 'tempHoldsProtectedFolder'; path: string }
  /** An environment variable that names another folder than `path`, which the platform resolved. */
  | { reason: 'variableElsewhere'; variableName: string; path: string };

/**
 * What the environment takes from the operating system: the load of the run's folders, its
 * user, its path rules, and its protected roots, which refuses an unsafe setup.
 */
export type EnvironmentPlatform = {
  /** Never throws. */
  loadEnvironment: () => Promise<Result<Environment, EnvironmentFailure>>;
};
