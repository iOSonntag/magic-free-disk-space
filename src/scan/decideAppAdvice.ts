import type { AdvisedApp } from './scanPlatform.js';

/**
 * The advice about the installed apps, for the user to uninstall the way the system does: every
 * app, each with its size where the system gives one, the largest first and those without a size
 * last, each group by name. The tool deletes none of them.
 */
export function decideAppAdvice(params: { apps: AdvisedApp[] }): AdvisedApp[] {
  return params.apps.toSorted(
    (left, right) =>
      (right.estimatedBytes ?? -1) - (left.estimatedBytes ?? -1) ||
      left.displayName.localeCompare(right.displayName, 'en'),
  );
}
