import { dlopen, FFIType } from 'bun:ffi';

const LONG_PATH_SEGMENT_COUNT = 6;
const LONG_PATH_SEGMENT_LENGTH = 50;

/** Folder names that, joined below any folder, make a path past the 260 characters of MAX_PATH. */
export const buildLongPathSegments = (): string[] => {
  return Array.from({ length: LONG_PATH_SEGMENT_COUNT }, (_, index) => {
    return `${index}-${'x'.repeat(LONG_PATH_SEGMENT_LENGTH)}`;
  });
};

/**
 * Whether this process may pass a path past MAX_PATH to a W function without its `\\?\` form, as
 * `RtlAreLongPathsEnabled` of ntdll answers it. Windows only; the test binds it itself, since no
 * code of the tool asks it.
 */
export function loadLongPathsEnabled(): boolean {
  const ntdll = dlopen('ntdll.dll', {
    RtlAreLongPathsEnabled: { args: [], returns: FFIType.u8 },
  });

  try {
    return ntdll.symbols.RtlAreLongPathsEnabled() !== 0;
  } finally {
    ntdll.close();
  }
}
