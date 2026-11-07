import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
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
  // Compared without case: macOS disks usually ignore it, and the looser match only refuses more.
  const lowerCaseRealPath = params.realPath.toLowerCase();
  const holdsProtectedPath = [
    ...params.environment.protectedRealPaths,
    ...params.environment.sensitiveRealPaths,
  ].some((protectedPath) =>
    isSameOrInsidePath({
      rules: params.environment.pathRules,
      path: protectedPath.toLowerCase(),
      parentPath: lowerCaseRealPath,
    }),
  );

  if (holdsProtectedPath) {
    return true;
  }

  const isInsideSensitivePath = params.environment.sensitiveRealPaths.some((sensitivePath) =>
    isSameOrInsidePath({
      rules: params.environment.pathRules,
      path: lowerCaseRealPath,
      parentPath: sensitivePath.toLowerCase(),
    }),
  );
  // Compared with case, unlike the refusals above: an exception lets more go, so only the exact
  // folder on disk counts.
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
