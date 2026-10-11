import type { ArgumentFailure } from '../cli/parseArguments.js';
import type { SelectionFailure } from '../cli/parseSelection.js';

const ARGUMENT_FAILURE_TEXTS: Record<ArgumentFailure['reason'], string> = {
  unknownOption: 'Unknown option',
  unexpectedArgument: 'Unexpected argument',
  missingValue: 'Missing value for',
  invalidNumber: 'Not a number of days from 1 to 36500',
  conflictingOptions: 'These options cannot be combined',
  selectNeedsDryRun: '--select works only with --dry-run',
};

const SELECTION_FAILURE_TEXTS: Record<SelectionFailure['reason'], string> = {
  unknownToken: 'Not a number, a range, "safe", or "none"',
  outOfRange: 'No item has this number',
  reversedRange: 'A range must go from the smaller to the larger number',
  noneMixed: '"none" must stand alone',
};

export function formatArgumentFailure(params: { failure: ArgumentFailure }): string {
  return `${ARGUMENT_FAILURE_TEXTS[params.failure.reason]}: ${params.failure.detail}`;
}

export function formatSelectionFailure(params: { failure: SelectionFailure }): string {
  return `${SELECTION_FAILURE_TEXTS[params.failure.reason]}: ${params.failure.token}`;
}
