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

/** Up to `maxCount` paths shown with `~`, then one line that counts the rest. */
export function formatSamplePathLines(params: {
  paths: string[];
  homeDir: string;
  maxCount: number;
}): string[] {
  const sampleLines = params.paths
    .slice(0, params.maxCount)
    .map((path) => formatHomeRelativePath({ path: path, homeDir: params.homeDir }));
  const restCount = params.paths.length - sampleLines.length;

  if (restCount <= 0) {
    return sampleLines;
  }

  return [...sampleLines, `and ${restCount.toLocaleString('en-US')} more`];
}
