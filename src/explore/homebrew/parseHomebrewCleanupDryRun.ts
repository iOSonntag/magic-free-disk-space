import { normalize } from 'node:path';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';

/** A path `brew cleanup -n` would remove, with the size Homebrew gave it, such as `3 files, 1.2MB`. */
export type HomebrewCleanupRemoval = { path: AbsolutePath; sizeText: string };

const REMOVAL_LINE_PREFIX = 'Would remove: ';

// Homebrew prints `(<n> files, <size>)` after a folder and `(<size>)` after a file; the path itself
// may hold spaces and parentheses, so the size is the last parenthesized group.
const REMOVAL_LINE_PATTERN = /^Would remove: (.+) \(([^()]+)\)$/;

/**
 * Reads every `Would remove:` line of `brew cleanup -n`, inside the Cellar and outside it. Other
 * lines, such as the closing `==> This operation would free…`, carry no path and are skipped.
 */
export function parseHomebrewCleanupDryRun(params: {
  stdoutText: string;
}): Result<HomebrewCleanupRemoval[], string> {
  const removals: HomebrewCleanupRemoval[] = [];

  for (const line of params.stdoutText.split('\n')) {
    if (!line.startsWith(REMOVAL_LINE_PREFIX)) {
      continue;
    }

    const removal = parseHomebrewCleanupRemoval({ line: line });

    if (removal === null) {
      return { kind: 'failed', failure: 'a Would remove line has no absolute path or no size' };
    }

    removals.push(removal);
  }

  return { kind: 'succeeded', value: removals };
}

function parseHomebrewCleanupRemoval(params: { line: string }): HomebrewCleanupRemoval | null {
  const match = REMOVAL_LINE_PATTERN.exec(params.line);
  const pathText = match?.[1];
  const sizeText = match?.[2];

  if (pathText === undefined || sizeText === undefined || normalize(pathText) !== pathText) {
    return null;
  }

  const path = parseAbsolutePath({ text: pathText });

  if (path.kind === 'failed') {
    return null;
  }

  return { path: path.value, sizeText: sizeText };
}
