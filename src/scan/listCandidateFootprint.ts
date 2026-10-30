import { listUnitPaths } from '../explore/exploreUnit.js';
import type { Candidate } from './candidate.js';

/** The paths the removal of the candidate takes away, compared against other items for overlap. */
export function listCandidateFootprint(candidate: Candidate): string[] {
  switch (candidate.removal.kind) {
    case 'deletePath':
      return [candidate.path];
    case 'runTool':
      return listUnitPaths(candidate.removal.unit);
  }
}
