import { formatHomeRelativePath } from '../path/formatHomeRelativePath.js';

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
