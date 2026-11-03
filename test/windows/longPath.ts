const LONG_PATH_SEGMENT_COUNT = 6;
const LONG_PATH_SEGMENT_LENGTH = 50;

/** Folder names that, joined below any folder, make a path past the 260 characters of MAX_PATH. */
export const buildLongPathSegments = (): string[] => {
  return Array.from({ length: LONG_PATH_SEGMENT_COUNT }, (_, index) => {
    return `${index}-${'x'.repeat(LONG_PATH_SEGMENT_LENGTH)}`;
  });
};
