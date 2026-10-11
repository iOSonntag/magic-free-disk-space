export function getErrorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    return String(error.code);
  }

  return 'unknown';
}
