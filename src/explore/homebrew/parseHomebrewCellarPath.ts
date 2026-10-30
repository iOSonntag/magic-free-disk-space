import { normalize } from 'node:path';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';

/** Reads the one line of `brew --cellar`, the absolute path of the brew's Cellar. */
export function parseHomebrewCellarPath(params: {
  stdoutText: string;
}): Result<AbsolutePath, string> {
  const text = params.stdoutText.trim();

  if (text.includes('\n') || normalize(text) !== text || text.endsWith('/')) {
    return { kind: 'failed', failure: 'not one normal path of a Cellar' };
  }

  return parseAbsolutePath({ text: text });
}
