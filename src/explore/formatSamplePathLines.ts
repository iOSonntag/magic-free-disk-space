import { formatHomeRelativePath } from '../path/formatHomeRelativePath.js';
import type { PathRules } from '../path/pathRules.js';

/** Up to `maxCount` paths shown with `~`, then one line that counts the rest. */
export function formatSamplePathLines(params: {
  pathRules: PathRules;
  paths: string[];
  homeDir: string;
  maxCount: number;
}): string[] {
  const sampleLines = params.paths
    .slice(0, params.maxCount)
    .map((path) =>
      formatHomeRelativePath({ rules: params.pathRules, path: path, homeDir: params.homeDir }),
    );
  const restCount = params.paths.length - sampleLines.length;

  if (restCount <= 0) {
    return sampleLines;
  }

  return [...sampleLines, `and ${restCount.toLocaleString('en-US')} more`];
}
