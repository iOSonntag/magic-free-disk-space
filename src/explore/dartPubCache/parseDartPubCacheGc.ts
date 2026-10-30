import { isAbsolute } from 'node:path';
import type { Result } from '../../result.js';

/** The tool's leading `--suppress-analytics` comes from the runner. */
export const DART_PUB_CACHE_GC_DRY_RUN_ARGS = ['pub', 'cache', 'gc', '--dry-run'];

const WOULD_DELETE_LINE = 'Would delete:';

const NOTHING_UNUSED_LINE = 'No unused cache entries found.';

/**
 * Parses the stdout of `dart pub cache gc --dry-run` into the paths it would delete, empty when
 * nothing is unused. Fails on output that has neither answer or lists a path that is not absolute.
 */
export function parseDartPubCacheGc(params: { stdoutText: string }): Result<string[], string> {
  const lines = params.stdoutText.split('\n').map((line) => line.trimEnd());
  const listStart = lines.indexOf(WOULD_DELETE_LINE);

  if (listStart === -1) {
    if (lines.includes(NOTHING_UNUSED_LINE)) {
      return { kind: 'succeeded', value: [] };
    }

    return {
      kind: 'failed',
      failure: `neither "${WOULD_DELETE_LINE}" nor "${NOTHING_UNUSED_LINE}"`,
    };
  }

  const listEnd = lines.indexOf('', listStart + 1);
  const gcPaths = lines.slice(listStart + 1, listEnd === -1 ? lines.length : listEnd);

  if (gcPaths.some((path) => !isAbsolute(path))) {
    return { kind: 'failed', failure: 'a listed path is not absolute' };
  }

  return { kind: 'succeeded', value: gcPaths };
}
