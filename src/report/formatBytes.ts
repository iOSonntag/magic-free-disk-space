/** The units as Finder labels them, with an upper-case K. */
type DecimalUnitValue = { value: number; unit: 'KB' | 'MB' | 'GB' | 'TB' };

const BYTES_PER_KILOBYTE = 1000;

const decimalUnitScales = [
  { unit: 'KB', bytesPerUnit: BYTES_PER_KILOBYTE },
  { unit: 'MB', bytesPerUnit: BYTES_PER_KILOBYTE ** 2 },
  { unit: 'GB', bytesPerUnit: BYTES_PER_KILOBYTE ** 3 },
] as const;

/**
 * Formats a byte count in decimal units, 1 GB being 10⁹ bytes, as macOS counts disk space.
 * Throws for a negative or non-integer count, which is a broken invariant of the caller.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw new RangeError(`formatBytes needs a non-negative integer, got ${bytes}`);
  }

  if (bytes < BYTES_PER_KILOBYTE) {
    return `${bytes} B`;
  }

  const scale = bytesToDecimalUnitValue({ bytes: bytes });
  const valueText = scale.value < 10 ? scale.value.toFixed(1) : String(Math.round(scale.value));

  return `${valueText} ${scale.unit}`;
}

/**
 * A size as the reports show it: prefixed with "at least" when the measurement is a lower bound.
 */
export function formatSizeText(params: { allocatedBytes: number; isComplete: boolean }): string {
  const bytesText = formatBytes(params.allocatedBytes);

  if (params.isComplete) {
    return bytesText;
  }

  return `at least ${bytesText}`;
}

/** The size of all the items together, "at least" when any of them is a lower bound. */
export function formatTotalSizeText(params: {
  items: { allocatedBytes: number; isComplete: boolean }[];
}): string {
  return formatSizeText({
    allocatedBytes: params.items.reduce((sum, item) => sum + item.allocatedBytes, 0),
    isComplete: params.items.every((item) => item.isComplete),
  });
}

function bytesToDecimalUnitValue(params: { bytes: number }): DecimalUnitValue {
  for (const scale of decimalUnitScales) {
    const value = params.bytes / scale.bytesPerUnit;

    // Compared after rounding, so 999.6 KB shows as 1.0 MB rather than 1000 KB.
    if (Math.round(value) < BYTES_PER_KILOBYTE) {
      return { value: value, unit: scale.unit };
    }
  }

  return { value: params.bytes / BYTES_PER_KILOBYTE ** 4, unit: 'TB' };
}
