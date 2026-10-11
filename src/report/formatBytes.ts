type BinaryUnitValue = { value: number; unit: 'KiB' | 'MiB' | 'GiB' | 'TiB' };

const binaryUnitScales = [
  { unit: 'KiB', bytesPerUnit: 1024 },
  { unit: 'MiB', bytesPerUnit: 1024 ** 2 },
  { unit: 'GiB', bytesPerUnit: 1024 ** 3 },
] as const;

/**
 * Formats a byte count in binary units. Throws for a negative or non-integer count,
 * which is a broken invariant of the caller.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw new RangeError(`formatBytes needs a non-negative integer, got ${bytes}`);
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const scale = bytesToBinaryUnitValue({ bytes: bytes });
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

function bytesToBinaryUnitValue(params: { bytes: number }): BinaryUnitValue {
  for (const scale of binaryUnitScales) {
    const value = params.bytes / scale.bytesPerUnit;

    // Compared after rounding, so 1023.6 KiB shows as 1.0 MiB rather than 1024 KiB.
    if (Math.round(value) < 1024) {
      return { value: value, unit: scale.unit };
    }
  }

  return { value: params.bytes / 1024 ** 4, unit: 'TiB' };
}
