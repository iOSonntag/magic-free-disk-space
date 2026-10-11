/**
 * True when `path` equals `parentPath` or lies below it, comparing whole path segments, so
 * `/a/bc` is not inside `/a/b`. Both paths must be absolute and normalized.
 */
export function isSameOrInsidePath(params: { path: string; parentPath: string }): boolean {
  if (params.path === params.parentPath) {
    return true;
  }

  const parentPrefix = params.parentPath.endsWith('/')
    ? params.parentPath
    : `${params.parentPath}/`;

  return params.path.startsWith(parentPrefix);
}
