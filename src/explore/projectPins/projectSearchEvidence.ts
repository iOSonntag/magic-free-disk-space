import type { ProjectPins } from './projectPins.js';

export const PINNED_VERSION_REINSTALL_EXPLANATION =
  'A project the search did not find would install this version again the next time it needs it.';

/**
 * The evidence lines every pinned unit adds after its own: the platform's `incompleteEvidence`
 * when the walk was not complete.
 */
export function buildProjectSearchEvidence(params: {
  pins: ProjectPins;
  incompleteEvidence: string;
}): string[] {
  if (params.pins.isWalkComplete) {
    return [];
  }

  return [params.incompleteEvidence];
}
