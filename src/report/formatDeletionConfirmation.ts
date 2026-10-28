import { DELETE_CONFIRMATION_WORD } from '../delete/confirmation.js';

export const CANCELLED_TEXT = 'Cancelled. Nothing was deleted.';

/** The warning before a permanent deletion, ending with the request for the confirmation word. */
export function formatDeletionWarningLines(): string[] {
  return [
    'This cannot be undone: the items do not go to the Trash.',
    `Type ${DELETE_CONFIRMATION_WORD} to delete them permanently.`,
  ];
}
