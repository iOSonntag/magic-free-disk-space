import { sep } from 'node:path';

/** Shows a path inside the home folder as `~/…`; any other path stays as it is. */
export function formatHomeRelativePath(params: { path: string; homeDir: string }): string {
  if (params.path === params.homeDir) {
    return '~';
  }

  const homePrefix = params.homeDir.endsWith(sep) ? params.homeDir : `${params.homeDir}${sep}`;

  if (!params.path.startsWith(homePrefix)) {
    return params.path;
  }

  return `~${sep}${params.path.slice(homePrefix.length)}`;
}
