/** The codes of an entry that is not there, or whose folder is not. */
const MISSING_CODES = ['ENOENT', 'ENOTDIR'];

/** The codes of an entry another program holds open, which only Windows refuses a call for. */
const inUseCodes = ['EBUSY'];

/** The codes of a call the entry's permissions, or Windows itself, refused. */
const PERMISSION_DENIED_CODES = ['EACCES', 'EPERM'];

export function getErrorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    return String(error.code);
  }

  return 'unknown';
}

/** Whether the code tells that the entry is not there, or its folder is not. */
export function isMissingErrorCode(code: string): boolean {
  return MISSING_CODES.includes(code);
}

/** Whether the code tells that another program holds the entry open. */
export function isInUseErrorCode(code: string): boolean {
  return inUseCodes.includes(code);
}

/** Whether the code tells that the call was refused, by the entry's permissions or by Windows. */
export function isPermissionDeniedErrorCode(code: string): boolean {
  return PERMISSION_DENIED_CODES.includes(code);
}
