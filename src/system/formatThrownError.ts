/** The message of an error, or the text of any other value a call threw. */
export function formatThrownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
