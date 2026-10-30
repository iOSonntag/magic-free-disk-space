import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { HomebrewCleanupRemoval } from './parseHomebrewCleanupDryRun.js';
import type { HomebrewFormulaName } from './parseHomebrewFormulaName.js';
import { parseHomebrewFormulaName } from './parseHomebrewFormulaName.js';

/** An old keg of a formula, such as `<cellar>/<formula>/1.2.3`, that `brew cleanup` would remove. */
export type HomebrewOldKeg = { path: AbsolutePath; version: string; sizeText: string };

/** The old kegs of one formula, in the order `brew cleanup -n` listed them. */
export type HomebrewOldVersions = { formula: HomebrewFormulaName; kegs: HomebrewOldKeg[] };

/**
 * Groups the removals under `<cellarPath>/<formula>/` by formula; every other removal, such as a
 * cached download or a path of another brew's Cellar, belongs to no formula here. Fails for a
 * folder of the Cellar whose name could start an option.
 */
export function buildHomebrewOldVersions(params: {
  cellarPath: AbsolutePath;
  removals: HomebrewCleanupRemoval[];
}): Result<HomebrewOldVersions[], string> {
  const cellarPrefix = `${params.cellarPath}/`;
  const kegsByFormula = new Map<HomebrewFormulaName, HomebrewOldKeg[]>();

  for (const removal of params.removals) {
    if (!removal.path.startsWith(cellarPrefix)) {
      continue;
    }

    const [formulaText, ...versionSegments] = removal.path.slice(cellarPrefix.length).split('/');
    const version = versionSegments.join('/');

    if (formulaText === undefined || version === '') {
      continue;
    }

    const formula = parseHomebrewFormulaName({ text: formulaText });

    if (formula.kind === 'failed') {
      return { kind: 'failed', failure: 'a Cellar folder of cleanup -n names no formula' };
    }

    const kegs = kegsByFormula.get(formula.value) ?? [];

    kegs.push({ path: removal.path, version: version, sizeText: removal.sizeText });
    kegsByFormula.set(formula.value, kegs);
  }

  const oldVersions = [...kegsByFormula].map(([formula, kegs]) => ({
    formula: formula,
    kegs: kegs,
  }));

  return { kind: 'succeeded', value: oldVersions };
}
