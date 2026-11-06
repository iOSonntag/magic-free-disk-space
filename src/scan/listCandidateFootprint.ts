import { listUnitPaths } from '../explore/exploreUnit.js';
import type { Candidate } from './candidate.js';

/**
 * The paths the removal of the candidate takes away, compared against other items for overlap:
 * its targets, the paths of its tool's unit, and none for an engine's unit, which has no host path.
 */
export function listCandidateFootprint(candidate: Candidate): string[] {
  switch (candidate.removal.kind) {
    case 'deletePaths':
    case 'deleteUnitPaths':
    case 'evictUnitFiles':
      return candidate.removal.targets.map((target) => target.path);
    case 'runTool':
      return listUnitPaths(candidate.removal.unit);
    case 'callEngine':
      return [];
  }
}

/** The targets of a probed candidate's removal, which its probe reserves; none for a tool or an engine. */
export function listProbedTargetPaths(candidate: Candidate): string[] {
  switch (candidate.removal.kind) {
    case 'deleteUnitPaths':
    case 'evictUnitFiles':
      return candidate.removal.targets.map((target) => target.path);
    case 'deletePaths':
    case 'runTool':
    case 'callEngine':
      return [];
  }
}
