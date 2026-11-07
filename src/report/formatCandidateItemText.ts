import type { Candidate } from '../scan/candidate.js';
import { formatDisplayText } from './formatDisplayText.js';

/**
 * The item a removal names: its path, or for an engine's unit its title and its engine, since
 * the path shown for it is the engine's disk image, which the engine keeps. Safe to show.
 */
export function formatCandidateItemText(params: { candidate: Candidate }): string {
  switch (params.candidate.removal.kind) {
    case 'deletePaths':
    case 'deleteUnitPaths':
    case 'runTool':
    case 'evictUnitFiles':
      return formatDisplayText({ text: params.candidate.path });
    case 'callEngine':
      return formatDisplayText({
        text: `${params.candidate.title}, in ${params.candidate.removal.unit.engineName}`,
      });
  }
}
