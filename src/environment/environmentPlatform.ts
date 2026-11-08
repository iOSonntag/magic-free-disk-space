import type { Result } from '../result.js';
import type { SystemCallFailure } from '../system/systemCallFailure.js';
import type { Environment } from './buildEnvironment.js';

/**
 * Why the run cannot start. `runElevated` is a Windows run with an elevated token, as with "Run as
 * administrator"; `callFailed` is a failed call of the operating system that reads the run's
 * account or its folders; `profileNotOwned` is a Windows user folder another account owns;
 * `tempHoldsProtectedFolder` is a temporary folder that is or holds a drive root or another folder
 * the tool never deletes; `variableElsewhere` is an environment variable that names another folder
 * than the one at `path`, which the platform resolved itself.
 */
export type EnvironmentFailure =
  | { reason: 'runAsRoot' }
  | { reason: 'runElevated' }
  | ({ reason: 'callFailed' } & SystemCallFailure)
  | { reason: 'unresolvable'; path: string; code: string }
  | { reason: 'homeNotOwned'; path: string }
  | { reason: 'profileNotOwned'; path: string }
  | { reason: 'tempOverlapsHome'; path: string }
  | { reason: 'tempHoldsProtectedFolder'; path: string }
  | { reason: 'variableElsewhere'; variableName: string; path: string };

/**
 * What the environment takes from the operating system: the load of the run's folders, its
 * user, its path rules, and its protected roots, which refuses an unsafe setup.
 */
export type EnvironmentPlatform = {
  /** Never throws. */
  loadEnvironment: () => Promise<Result<Environment, EnvironmentFailure>>;
};
