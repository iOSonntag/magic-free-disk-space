import type { ExploreToolUnit } from '../explore/exploreUnit.js';
import { buildUnitRunArguments } from '../explore/exploreUnit.js';
import type { Candidate } from '../scan/candidate.js';
import { formatDisplayText } from './formatDisplayText.js';

/**
 * `<tool name> <arguments>` of a tool item, as `formatToolCommandText` words it. `null` for an item
 * deleted as its paths, evicted, removed over its engine's API, or a Recycle Bin, which the system
 * empties, since none runs a command.
 */
export function formatCandidateCommandText(params: { candidate: Candidate }): string | null {
  switch (params.candidate.removal.kind) {
    case 'deletePaths':
    case 'deleteUnitPaths':
    case 'evictUnitFiles':
    case 'callEngine':
    case 'emptyRecycleBin':
      return null;
    case 'runTool':
      return formatToolCommandText({ unit: params.candidate.removal.unit });
  }
}

/**
 * `<tool name> <arguments>` of a tool's unit, the tool's leading arguments included, so it reads
 * as the command that runs; safe to show.
 */
export function formatToolCommandText(params: { unit: ExploreToolUnit }): string {
  const commandText = [params.unit.tool.name, ...buildUnitRunArguments(params.unit)].join(' ');

  return formatDisplayText({ text: commandText });
}
