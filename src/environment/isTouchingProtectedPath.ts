import { isPossiblySameOrInsidePath, isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { Environment } from './buildEnvironment.js';

/**
 * Whether a removal of `realPath` would touch what the environment guards: it is or holds a
 * protected or sensitive path, or lies inside a sensitive path and none of its exceptions.
 * `realPath` must be the absolute real path, as a file's identity names it.
 */
export function isTouchingProtectedPath(params: {
  environment: Environment;
  realPath: string;
}): boolean {
  const holdsProtectedPath = [
    ...params.environment.protectedRealPaths,
    ...params.environment.sensitiveRealPaths,
  ].some((protectedPath) =>
    isPossiblySameOrInsidePath({
      rules: params.environment.pathRules,
      path: protectedPath,
      parentPath: params.realPath,
    }),
  );

  if (holdsProtectedPath) {
    return true;
  }

  const isInsideSensitivePath = params.environment.sensitiveRealPaths.some((sensitivePath) =>
    isPossiblySameOrInsidePath({
      rules: params.environment.pathRules,
      path: params.realPath,
      parentPath: sensitivePath,
    }),
  );
  // Compared as the platform compares names, unlike the looser refusals above: an exception lets
  // more go, so only the folder on disk counts.
  const isInsideSensitiveException = params.environment.sensitiveExceptionRealPaths.some(
    (exceptionPath) =>
      isSameOrInsidePath({
        rules: params.environment.pathRules,
        path: params.realPath,
        parentPath: exceptionPath,
      }),
  );

  return isInsideSensitivePath && !isInsideSensitiveException;
}
