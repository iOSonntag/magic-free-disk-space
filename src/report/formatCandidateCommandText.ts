import { buildUnitRunArguments } from '../explore/exploreUnit.js';
import type { Candidate } from '../scan/candidate.js';
import { formatDisplayText } from './formatDisplayText.js';

/**
 * `<tool name> <arguments>` of a tool item, the tool's leading arguments included, so it reads as
 * the command that runs; safe to show. `null` for an item deleted as a path or a unit's folder.
 */
export function formatCandidateCommandText(params: { candidate: Candidate }): string | null {
  switch (params.candidate.removal.kind) {
    case 'deletePath':
    case 'deleteUnitFolder':
      return null;
    case 'runTool': {
      const unit = params.candidate.removal.unit;
      const commandText = [unit.tool.name, ...buildUnitRunArguments(unit)].join(' ');

      return formatDisplayText({ text: commandText });
    }
  }
}
