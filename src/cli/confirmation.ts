export const DELETE_CONFIRMATION_WORD = 'DELETE';

export function isDeleteConfirmation(params: { line: string }): boolean {
  return params.line.trim() === DELETE_CONFIRMATION_WORD;
}
