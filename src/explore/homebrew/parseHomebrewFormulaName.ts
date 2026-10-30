import type { Result } from '../../result.js';

declare const homebrewFormulaNameBrand: unique symbol;

/** A formula name that `parseHomebrewFormulaName` checked, so it never reads as an option. */
export type HomebrewFormulaName = string & { [homebrewFormulaNameBrand]: true };

// The name becomes an argument of `brew cleanup`; formula names use these characters, such as
// `python@3.12` or `libxml++`.
const FORMULA_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@+._-]*$/;

/** The one maker of a `HomebrewFormulaName`; fails unless it starts with a letter or a digit. */
export function parseHomebrewFormulaName(params: {
  text: string;
}): Result<HomebrewFormulaName, string> {
  if (!FORMULA_NAME_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'not a formula name' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as HomebrewFormulaName };
}
