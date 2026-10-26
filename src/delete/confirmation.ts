export const DELETE_CONFIRMATION_WORD = 'DELETE';

export function isDeleteConfirmation(params: { confirmation: string }): boolean {
  return params.confirmation.trim() === DELETE_CONFIRMATION_WORD;
}
