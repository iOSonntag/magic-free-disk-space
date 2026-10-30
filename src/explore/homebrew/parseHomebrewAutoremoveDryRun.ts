import type { Result } from '../../result.js';
import type { HomebrewFormulaName } from './parseHomebrewFormulaName.js';
import { parseHomebrewFormulaName } from './parseHomebrewFormulaName.js';

const HEADER_PATTERN = /^==> Would autoremove (\d+) unneeded formulae?:$/;

/**
 * Reads the formulae `brew autoremove -n` lists: nothing when none is unneeded, else a header with
 * their count and one full name per line, `<user>/<tap>/<name>` for a tap formula, whose keg is
 * `<cellar>/<name>`. Fails on any other shape.
 */
export function parseHomebrewAutoremoveDryRun(params: {
  stdoutText: string;
}): Result<HomebrewFormulaName[], string> {
  const lines = params.stdoutText
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '');
  const [headerLine, ...nameLines] = lines;

  if (headerLine === undefined) {
    return { kind: 'succeeded', value: [] };
  }

  const countText = HEADER_PATTERN.exec(headerLine)?.[1];

  if (countText === undefined || Number(countText) !== nameLines.length) {
    return { kind: 'failed', failure: 'no Would autoremove header that counts the names below it' };
  }

  const formulae: HomebrewFormulaName[] = [];

  for (const nameLine of nameLines) {
    const formula = parseHomebrewFullFormulaName({ text: nameLine });

    if (formula === null) {
      return { kind: 'failed', failure: 'a line names no formula' };
    }

    formulae.push(formula);
  }

  return { kind: 'succeeded', value: formulae };
}

function parseHomebrewFullFormulaName(params: { text: string }): HomebrewFormulaName | null {
  const segments = params.text.split('/');
  const name = segments.at(-1);
  const isTapFormula = segments.length === 3 && segments.every((segment) => segment !== '');

  if (name === undefined || (segments.length !== 1 && !isTapFormula)) {
    return null;
  }

  const formula = parseHomebrewFormulaName({ text: name });

  if (formula.kind === 'failed') {
    return null;
  }

  return formula.value;
}
