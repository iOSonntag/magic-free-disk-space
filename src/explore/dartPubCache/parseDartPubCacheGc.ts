import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreProbeDefinition } from '../loadProbeOutput.js';

/** The tool's leading `--suppress-analytics` comes from the runner. */
export const DART_PUB_CACHE_GC_DRY_RUN_PROBE: ExploreProbeDefinition<AbsolutePath[]> = {
  toolName: 'dart',
  args: ['pub', 'cache', 'gc', '--dry-run'],
  parse: parseDartPubCacheGc,
};

const WOULD_DELETE_LINE = 'Would delete:';

const NOTHING_UNUSED_LINE = 'No unused cache entries found.';

/**
 * Parses the stdout of `dart pub cache gc --dry-run` into the paths it would delete, empty when
 * nothing is unused. Fails on output that has neither answer or lists a path that is not absolute.
 */
export function parseDartPubCacheGc(params: {
  stdoutText: string;
}): Result<AbsolutePath[], string> {
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

  return parseGcPathLines({
    lines: lines.slice(listStart + 1, listEnd === -1 ? lines.length : listEnd),
  });
}

function parseGcPathLines(params: { lines: string[] }): Result<AbsolutePath[], string> {
  const gcPaths: AbsolutePath[] = [];

  for (const line of params.lines) {
    const gcPath = parseAbsolutePath({ text: line });

    if (gcPath.kind === 'failed') {
      return { kind: 'failed', failure: 'a listed path is not absolute' };
    }

    gcPaths.push(gcPath.value);
  }

  return { kind: 'succeeded', value: gcPaths };
}
