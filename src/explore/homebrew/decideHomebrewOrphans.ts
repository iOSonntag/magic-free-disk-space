import type { HomebrewOrphan } from './loadHomebrewState.js';

/** The orphans when each rack holds the one keg `brew autoremove` removes, none listed included. */
export type HomebrewOrphansJudged = { kind: 'judged'; orphans: HomebrewOrphan[] };

/** A rack of an orphan that holds no keg or more than one, or is absent. */
export type HomebrewOrphansNotJudged = { kind: 'notJudged' };

export type HomebrewOrphans = HomebrewOrphansJudged | HomebrewOrphansNotJudged;

/**
 * Judged only while each rack holds exactly one keg folder, since `brew autoremove` uninstalls one
 * keg of each orphan and the orphans unit measures the whole rack.
 */
export function decideHomebrewOrphans(params: { orphans: HomebrewOrphan[] }): HomebrewOrphans {
  const eachRackHoldsOneKeg = params.orphans.every((orphan) => orphan.kegCount === 1);

  if (!eachRackHoldsOneKeg) {
    return { kind: 'notJudged' };
  }

  return { kind: 'judged', orphans: params.orphans };
}
