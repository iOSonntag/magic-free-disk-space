import type { ProjectPins } from './projectPins.js';

export const PROJECT_SEARCH_INCOMPLETE_EVIDENCE =
  'The project search stopped at its time limit, could not read some folders, or left out folders stored only in iCloud, so some projects were not searched.';

export const PINNED_VERSION_REINSTALL_EXPLANATION =
  'A project the search did not find would install this version again the next time it needs it.';

/** The evidence lines every pinned unit adds after its own: one when the walk was not complete. */
export function buildProjectSearchEvidence(params: { pins: ProjectPins }): string[] {
  if (params.pins.isWalkComplete) {
    return [];
  }

  return [PROJECT_SEARCH_INCOMPLETE_EVIDENCE];
}
