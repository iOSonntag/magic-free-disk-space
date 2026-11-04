import { DELETE_CONFIRMATION_WORD } from '../delete/confirmation.js';
import type { ReportTexts } from './reportTexts.js';

export const CANCELLED_TEXT = 'Cancelled. Nothing was deleted.';

/** The warning before a permanent deletion, ending with the request for the confirmation word. */
export function formatDeletionWarningLines(params: { texts: ReportTexts }): string[] {
  return [
    `This cannot be undone: the items do not go to the ${params.texts.trashName}.`,
    `Type ${DELETE_CONFIRMATION_WORD} to delete them permanently.`,
    'Anything else cancels.',
  ];
}
